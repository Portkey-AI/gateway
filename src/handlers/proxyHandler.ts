import { Context, HonoRequest } from "hono";
import { retryRequest } from "./retryHandler";
import Providers from "../providers";
import { ANTHROPIC, MAX_RETRIES, HEADER_KEYS, PROXY_REQUEST_PATH_PREFIX, RETRY_STATUS_CODES, POWERED_BY } from "../globals";
import { responseHandler } from "./handlerUtils";
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

    let fetchOptions = {
        headers: headersToSend(requestHeaders, store.customHeadersToAvoid),
        method: request.method,
        body: JSON.stringify(store.reqBody)
    };

    let retryCount = Math.min(parseInt(requestHeaders[HEADER_KEYS.RETRIES]), MAX_RETRIES);
    const getFromCacheFunction = c.get('getFromCache');
    const cacheIdentifier = c.get('cacheIdentifier');
    const requestOptions = c.get('requestOptions') ?? [];
    let cacheResponse, cacheStatus;
    if (getFromCacheFunction) {
      [cacheResponse, cacheStatus] = await getFromCacheFunction(c.env, {...requestHeaders, ...fetchOptions.headers}, store.reqBody, 'proxy', cacheIdentifier);
      if (cacheResponse) {
        const cacheMappedResponse = await responseHandler(new Response(cacheResponse, {headers: {
          "content-type": "application/json"
        }}), store.isStreamingMode, store.proxyProvider, undefined);
        c.set("requestOptions", [...requestOptions, {
          providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
          requestParams: store.reqBody,
          response: cacheMappedResponse.clone(),
          cacheStatus: cacheStatus
        }])
        return cacheMappedResponse;
      }
    }
    // Make the API call to the provider
    let [lastResponse, lastAttempt] = await retryRequest(urlToFetch, fetchOptions, retryCount, RETRY_STATUS_CODES);

    const mappedResponse = await responseHandler(lastResponse, store.isStreamingMode, store.proxyProvider, undefined);
    if (lastAttempt) mappedResponse.headers.append("x-portkey-retries", lastAttempt.toString());

    c.set("requestOptions", [...requestOptions, {
      providerOptions: {...store.reqBody, provider: store.proxyProvider, requestURL: urlToFetch, rubeusURL: 'proxy'},
      requestParams: store.reqBody,
      response: mappedResponse.clone(),
      cacheStatus: cacheStatus
    }])

    return mappedResponse
}
