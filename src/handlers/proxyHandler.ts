import { Context, HonoRequest } from "hono";
import { retryRequest } from "./retryHandler";
import Providers from "../providers";
import { ANTHROPIC, MAX_RETRIES, HEADER_KEYS, PROXY_REQUEST_PATH_PREFIX, RETRY_STATUS_CODES, POWERED_BY, RESPONSE_HEADER_KEYS, AZURE_OPEN_AI } from "../globals";
import { fetchProviderOptionsFromConfig, responseHandler, tryProvidersInSequence } from "./handlerUtils";
import { getStreamingMode } from "../utils";

// Find the proxy provider
function proxyProvider(proxyModeHeader:string) {
  const [proxyMode, proxyProvider] = proxyModeHeader.split(" ");
  return proxyProvider;
}

function getProxyPath(requestURL:string, proxyProvider:string) {
  let reqURL = new URL(requestURL);
  let reqPath = reqURL.pathname;
  const reqQuery = reqURL.search;
  reqPath = reqPath.replace(PROXY_REQUEST_PATH_PREFIX, "");
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


function headersToSend(headersObj: Record<string, string>, customHeadersToIgnore: Array<string>): Record<string, string> {
  let final: Record<string, string> = {};
  const poweredByHeadersPattern = `x-${POWERED_BY}-`;
  const headersToAvoid = [...customHeadersToIgnore]
  headersToAvoid.push("content-length");
  Object.keys(headersObj).forEach((key: string) => {
    if (!headersToAvoid.includes(key) && !key.startsWith(poweredByHeadersPattern)) {
      final[key] = headersObj[key];
    }
  });
  return final;
}

export async function proxyHandler(c: Context, env: any, request: HonoRequest<"/v1/proxy/*">): Promise<Response> {
    let requestHeaders = Object.fromEntries(request.headers);

    const store: Record<string, any> = {
      proxyProvider: proxyProvider(requestHeaders[HEADER_KEYS.MODE]),
      reqBody: await request.json(),
      customHeadersToAvoid: env.CUSTOM_HEADERS_TO_IGNORE ?? [],
    }
    store.isStreamingMode = getStreamingMode(store.reqBody)
    let urlToFetch = getProxyPath(request.url, store.proxyProvider);

    if (requestHeaders['x-rubeus-config']) {
      const config = JSON.parse(requestHeaders['x-rubeus-config']);
      let  providerOptions = fetchProviderOptionsFromConfig(config);

      if (!providerOptions) {
        const errorResponse = {
          error: { message: `Could not find a provider option.`,}
        };
        throw errorResponse;
      }
      providerOptions = providerOptions.map(po => ({
        ...po, urlToFetch
      }))

      try {
          return await tryProvidersInSequence(c, providerOptions, {
            params: store.reqBody, config: config
          }, requestHeaders, "proxy");
      } catch (error:any) {
        const errorArray = JSON.parse(error.message);
        throw errorArray[errorArray.length - 1];
      }
    }

    let fetchOptions = {
        headers: headersToSend(requestHeaders, store.customHeadersToAvoid),
        method: request.method,
        body: JSON.stringify(store.reqBody)
    };

    let retryCount = Math.min(parseInt(requestHeaders[HEADER_KEYS.RETRIES]), MAX_RETRIES);
    const getFromCacheFunction = c.get('getFromCache');
    const cacheIdentifier = c.get('cacheIdentifier');
    const requestOptions = c.get('requestOptions') ?? [];
    let cacheResponse, cacheStatus, cacheKey;
    if (getFromCacheFunction) {
      [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(c.env, {...requestHeaders, ...fetchOptions.headers}, store.reqBody, urlToFetch, cacheIdentifier);
      if (cacheResponse) {
        const cacheMappedResponse = await responseHandler(new Response(cacheResponse, {headers: {
          "content-type": "application/json"
        }}), false, store.proxyProvider, undefined);
        c.set("requestOptions", [...requestOptions, {
          providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
          requestParams: store.reqBody,
          response: cacheMappedResponse.clone(),
          cacheStatus: cacheStatus,
          cacheKey: cacheKey
        }])
        return cacheMappedResponse;
      }
    }
    // Make the API call to the provider
    let [lastResponse, lastAttempt] = await retryRequest(urlToFetch, fetchOptions, retryCount, RETRY_STATUS_CODES);

    const mappedResponse = await responseHandler(lastResponse, store.isStreamingMode, store.proxyProvider, undefined);
    if (lastAttempt) mappedResponse.headers.append(RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT, lastAttempt.toString());

    c.set("requestOptions", [...requestOptions, {
      providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
      requestParams: store.reqBody,
      response: mappedResponse.clone(),
      cacheStatus: cacheStatus,
      cacheKey: cacheKey
    }])

    return mappedResponse
}
