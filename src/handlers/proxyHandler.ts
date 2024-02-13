import { Context } from "hono";
import { retryRequest } from "./retryHandler";
import Providers from "../providers";
import { ANTHROPIC, MAX_RETRIES, HEADER_KEYS, RETRY_STATUS_CODES, POWERED_BY, RESPONSE_HEADER_KEYS, AZURE_OPEN_AI, CONTENT_TYPES } from "../globals";
import { fetchProviderOptionsFromConfig, responseHandler, tryProvidersInSequence, updateResponseHeaders } from "./handlerUtils";
import { convertKeysToCamelCase, getStreamingMode } from "../utils";
import { Config, ShortConfig } from "../types/requestBody";
import { env } from "hono/adapter"
// Find the proxy provider
function proxyProvider(proxyModeHeader:string, providerHeader: string) {
  const proxyProvider = proxyModeHeader?.split(" ")[1] ?? providerHeader;
  return proxyProvider;
}

function getProxyPath(requestURL:string, proxyProvider:string, proxyEndpointPath:string) {
  let reqURL = new URL(requestURL);
  let reqPath = reqURL.pathname;
  const reqQuery = reqURL.search;
  reqPath = reqPath.replace(proxyEndpointPath, "");
  const providerBasePath = Providers[proxyProvider].api.baseURL;
  if (proxyProvider === AZURE_OPEN_AI) {
    return `https:/${reqPath}${reqQuery}`;
  }
  let proxyPath = `${providerBasePath}${reqPath}${reqQuery}`;
  
  // Fix specific for Anthropic SDK calls. Is this needed? - Yes
  if (proxyProvider === ANTHROPIC) {
      proxyPath = proxyPath.replace("/v1/v1/", "/v1/");
  }

  return proxyPath;
}

async function getRequestData(request: Request, contentType: string) {
  let requestJSON: Record<string, any> = {};
  let requestFormData;
  let requestBody = "";

  if (contentType == CONTENT_TYPES.APPLICATION_JSON) {
    if (["GET", "DELETE"].includes(request.method)) {
      return [requestJSON, requestFormData]
    }
    requestBody = await request.text();
    requestJSON = JSON.parse(requestBody);
  } else if (contentType == CONTENT_TYPES.MULTIPART_FORM_DATA) {
    requestFormData = await request.formData();
    requestFormData.forEach(function (value, key) {
      requestJSON[key] = value;
    });
  }

  return [requestJSON, requestFormData];
}

function headersToSend(headersObj: Record<string, string>, customHeadersToIgnore: Array<string>): Record<string, string> {
  let final: Record<string, string> = {};
  const poweredByHeadersPattern = `x-${POWERED_BY}-`;
  const headersToAvoid = [...customHeadersToIgnore];
  if (headersObj["content-type"]?.split(";")[0] === CONTENT_TYPES.MULTIPART_FORM_DATA) {
    headersToAvoid.push("content-type");
  }
  headersToAvoid.push("content-length");
  Object.keys(headersObj).forEach((key: string) => {
    if (!headersToAvoid.includes(key) && !key.startsWith(poweredByHeadersPattern)) {
      final[key] = headersObj[key];
    }
  });

  return final;
}

export async function proxyHandler(c: Context): Promise<Response> {
  try {
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const requestContentType = requestHeaders["content-type"]?.split(";")[0];
    const [requestJSON, requestFormData] = await getRequestData(c.req.raw, requestContentType);
    const store: Record<string, any> = {
      proxyProvider: proxyProvider(requestHeaders[HEADER_KEYS.MODE], requestHeaders[`x-${POWERED_BY}-provider`]),
      reqBody: requestJSON,
      requestFormData: requestFormData,
      customHeadersToAvoid: env(c).CUSTOM_HEADERS_TO_IGNORE ?? [],
      proxyPath: c.req.url.indexOf("/v1/proxy") > -1 ? "/v1/proxy" : "/v1"
    }

    let requestConfig: Config | ShortConfig | null = null; 
    if (requestHeaders[`x-${POWERED_BY}-config`]) {
      requestConfig = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);
      if (requestConfig && 'provider' in requestConfig){
        store.proxyProvider = requestConfig.provider;
      }
    };

    let urlToFetch = getProxyPath(c.req.url, store.proxyProvider, store.proxyPath);
    store.isStreamingMode = getStreamingMode(store.reqBody, store.proxyProvider, urlToFetch)

    if (requestConfig &&
      (
        ("options" in requestConfig && requestConfig.options) ||
        ("targets" in requestConfig && requestConfig.targets) ||
        ("provider" in requestConfig && requestConfig.provider)
      )
    ) {
      let  providerOptions = fetchProviderOptionsFromConfig(requestConfig);
      
      if (!providerOptions) {
        return new Response(JSON.stringify({
          status: "failure",
          message: "Could not find a provider option."
          }), {
            status: 400,
            headers: {
                "content-type": "application/json"
            }
        });
      }


      providerOptions = providerOptions.map(po => ({
        ...po, 
        urlToFetch
      }))

      try {
          return await tryProvidersInSequence(c, providerOptions, store.reqBody, requestHeaders, "proxy");
      } catch (error:any) {
        const errorArray = JSON.parse(error.message);
        return new Response(errorArray[errorArray.length - 1].errorObj, {
          status: errorArray[errorArray.length - 1].status,
          headers: {
              "content-type": "application/json"
          }
        });
      }
    }

    if (requestConfig) {
      requestConfig  = convertKeysToCamelCase(requestConfig as Record<string, any>, ["override_params", "params", "metadata"]) as Config | ShortConfig;
    }

    let fetchOptions = {
        headers: headersToSend(requestHeaders, store.customHeadersToAvoid),
        method: c.req.method,
        body: requestContentType === CONTENT_TYPES.MULTIPART_FORM_DATA ? store.requestFormData : JSON.stringify(store.reqBody)
    };

    let retryCount = 0;
    let retryStatusCodes = RETRY_STATUS_CODES;
    if (requestHeaders[HEADER_KEYS.RETRIES]) {
      retryCount = parseInt(requestHeaders[HEADER_KEYS.RETRIES]);
    } else if (requestConfig?.retry && typeof requestConfig.retry === "object") {
        retryCount = requestConfig.retry?.attempts ?? 1, 
        retryStatusCodes = requestConfig.retry?.onStatusCodes ?? RETRY_STATUS_CODES
    }

    retryCount = Math.min(retryCount, MAX_RETRIES);

    const getFromCacheFunction = c.get('getFromCache');
    const cacheIdentifier = c.get('cacheIdentifier');

    let cacheResponse, cacheKey, cacheMaxAge;
    let cacheStatus = "DISABLED";
    let cacheMode = requestHeaders[HEADER_KEYS.CACHE];

    if (requestConfig?.cache && typeof requestConfig.cache === "object" && requestConfig.cache.mode) {
      cacheMode = requestConfig.cache.mode;
      cacheMaxAge = requestConfig.cache.maxAge;
    } else if (requestConfig?.cache && typeof requestConfig.cache === "string") {
      cacheMode = requestConfig.cache
    }

    if (getFromCacheFunction && cacheMode) {
      [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(env(c), {...requestHeaders, ...fetchOptions.headers}, store.reqBody, urlToFetch, cacheIdentifier, cacheMode);
      if (cacheResponse) {
        const cacheMappedResponse = await responseHandler(new Response(cacheResponse, {headers: {
          "content-type": "application/json"
        }}), false, store.proxyProvider, undefined, urlToFetch);
        c.set("requestOptions", [{
          providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
          requestParams: store.reqBody,
          response: cacheMappedResponse.clone(),
          cacheStatus: cacheStatus,
          cacheKey: cacheKey,
          cacheMode: cacheMode,
          cacheMaxAge: cacheMaxAge
        }])
        updateResponseHeaders(cacheMappedResponse, 0, store.reqBody, cacheStatus, 0, requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");
        return cacheMappedResponse;
      }
    }

    // Make the API call to the provider
    let [lastResponse, lastAttempt] = await retryRequest(urlToFetch, fetchOptions, retryCount, retryStatusCodes, null);
    const mappedResponse = await responseHandler(lastResponse, store.isStreamingMode, store.proxyProvider, undefined, urlToFetch);
    updateResponseHeaders(mappedResponse, 0, store.reqBody, cacheStatus, (lastAttempt ?? 0), requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");

    c.set("requestOptions", [{
      providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
      requestParams: store.reqBody,
      response: mappedResponse.clone(),
      cacheStatus: cacheStatus,
      cacheKey: cacheKey,
      cacheMode: cacheMode,
      cacheMaxAge: cacheMaxAge
    }])

    return mappedResponse;
  } catch (err: any) {
    console.log("proxy error", err.message);
    return new Response(
        JSON.stringify({
            status: "failure",
            message: "Something went wrong",
        }), {
          status: 500,
          headers: {
              "content-type": "application/json"
          }
      }
    );
  } 
}
