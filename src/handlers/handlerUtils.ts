import { Context } from "hono";
import Providers from "../providers";
import { BaseResponse, ProviderAPIConfig, endpointStrings } from "../providers/types";
import transformToProviderRequest from "../services/transformToProviderRequest";
import { EmbedRequestBody } from "../types/embedRequestBody";
import { Options, Params, RequestBody } from "../types/requestBody";
import { retryRequest } from "./retryHandler";
import { handleNonStreamingMode, handleStreamingMode } from "./streamHandler";

/**
 * Constructs the request options for the API call.
 *
 * @param {any} headers - The headers to add in the request.
 * @param {string} apiKey - The API key for the request.
 * @param {string} provider - The provider for the request.
 * @returns {RequestInit} - The fetch options for the request.
 */
export function constructRequest(headers: any, provider: string = "") {
  let baseHeaders: any = {
    "content-type": "application/json",
    // "x-portkey-api-key": "x2trk", // TODO: this needs to be replaced.
    // "x-portkey-mode": `proxy ${provider}`,
    // "x-portkey-cache": "semantic"
  };

  // Add any headers that the model might need
  headers = {...baseHeaders, ...headers}
  
  let fetchOptions: RequestInit = {
    method: "POST",
    headers,
  };

  return fetchOptions;
}

/**
 * Selects a provider based on their assigned weights.
 * The weight is used to determine the probability of each provider being chosen.
 * If all providers have a weight of 0, an error will be thrown.
 *
 * @param {Options[]} providers - The available providers.
 * @returns {Options} - The selected provider.
 * @throws Will throw an error if no provider is selected, or if all weights are 0.
 */
export function selectProviderByWeight(providers:Options[]): Options {
  // Assign a default weight of 1 to providers with undefined weight
  providers = providers.map(provider => ({...provider, weight: provider.weight ?? 1}));

  // Compute the total weight
  let totalWeight = providers.reduce((sum:number, provider:any) => sum + provider.weight, 0);

  // Select a random weight between 0 and totalWeight
  let randomWeight = Math.random() * totalWeight;

  // Find the provider that corresponds to the selected weight
  for (let provider of providers) {
    // @ts-ignore since weight is being default set above
    if (randomWeight < provider.weight) {
      return provider;
    }
    // @ts-ignore since weight is being default set above
    randomWeight -= provider.weight;
  }

  throw new Error("No provider selected, please check the weights");
}

/**
 * Gets the provider options based on the specified mode.
 * Modes can be "single" (uses the first provider), "loadbalance" (selects one provider based on weights),
 * or "fallback" (uses all providers in the given order). If the mode does not match these options, null is returned.
 *
 * @param {string} mode - The mode for selecting providers.
 * @param {any} config - The configuration for the providers.
 * @returns {(Options[]|null)} - The selected provider options.
 */
export function getProviderOptionsByMode(mode: string, config: any): Options[]|null {
  switch (mode) {
    case "single":
      return [config.options[0]];
    case "loadbalance":
      return [selectProviderByWeight(config.options)];
    case "fallback":
      return config.options;
    default:
      return null;
  }    
}

/**
 * Makes a POST request to a provider and returns the response.
 * The POST request is constructed using the provider, apiKey, and requestBody parameters.
 * The fn parameter is the type of request being made (e.g., "complete", "chatComplete").
 *
 * @param {Options} providerOption - The provider options. This object follows the Options interface and may contain a RetrySettings object for retry configuration.
 * @param {RequestBody} requestBody - The request body.
 * @param {string} fn - The function for the request.
 * @returns {Promise<CompletionResponse>} - The response from the POST request.
 * @throws Will throw an error if the response is not ok or if all retry attempts fail.
 */
export async function tryPostProxy(c: Context, providerOption:Options, requestBody: RequestBody|EmbedRequestBody, requestHeaders: Record<string, string>, fn: endpointStrings): Promise<Response> {
  const overrideParams = providerOption?.override_params || {};
  const params: Params = {...requestBody.params, ...overrideParams};
  const isStreamingMode = params.stream ? true : false;

  const provider:string = providerOption.provider ?? "";
  
  // Mapping providers to corresponding URLs
  const apiConfig: ProviderAPIConfig = Providers[provider].api;
  let fetchOptions;
  if (provider=="azure-openai") {
    // Construct the base object for the POST request
    if(!!providerOption.apiKey) {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey, "apiKey"), provider);
    } else {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.adAuth, "adAuth"), provider);
    }
  } else {
    // Construct the base object for the POST request
    fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey), provider);
  }
  
  // Construct the full URL
  const url = providerOption.urlToFetch as string;

  let response:Response;
  let retryCount:number|undefined;

  if (!providerOption.retry) {
    providerOption.retry = {attempts: 1, onStatusCodes:[]}
  }

  const getFromCacheFunction = c.get('getFromCache');
  const cacheIdentifier = c.get('cacheIdentifier');
  const requestOptions = c.get('requestOptions') ?? [];
  let cacheResponse, cacheStatus;
  if (getFromCacheFunction) {
    [cacheResponse, cacheStatus] = await getFromCacheFunction(c.env, {...requestHeaders, ...fetchOptions.headers}, requestBody, fn, cacheIdentifier);
    if (cacheResponse) {
      response = await responseHandler(new Response(cacheResponse, {headers: {
        "content-type": "application/json"
      }}), isStreamingMode, provider, undefined);
      c.set("requestOptions", [...requestOptions, {
        providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
        requestParams: params,
        response: response.clone(),
        cacheStatus: cacheStatus
      }])
      return response;
    }
  }

  [response, retryCount] = await retryRequest(url, fetchOptions, providerOption.retry.attempts, providerOption.retry.onStatusCodes);
  const mappedResponse = await responseHandler(response, isStreamingMode, provider, undefined);

  c.set("requestOptions", [...requestOptions, {
    providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
    requestParams: params,
    response: mappedResponse.clone(),
    cacheStatus: cacheStatus
  }])
  // If the response was not ok, throw an error
  if (!response.ok) {
    // Check if this request needs to be retried
    const errorObj: any = new Error(await mappedResponse.text());
    errorObj.status = mappedResponse.status;
    throw errorObj;
  }

  return mappedResponse;
}

/**
 * Makes a POST request to a provider and returns the response.
 * The POST request is constructed using the provider, apiKey, and requestBody parameters.
 * The fn parameter is the type of request being made (e.g., "complete", "chatComplete").
 *
 * @param {Options} providerOption - The provider options. This object follows the Options interface and may contain a RetrySettings object for retry configuration.
 * @param {RequestBody} requestBody - The request body.
 * @param {string} fn - The function for the request.
 * @returns {Promise<CompletionResponse>} - The response from the POST request.
 * @throws Will throw an error if the response is not ok or if all retry attempts fail.
 */
export async function tryPost(c: Context, providerOption:Options, requestBody: RequestBody|EmbedRequestBody, requestHeaders: Record<string, string>, fn: endpointStrings): Promise<Response> {
  const overrideParams = providerOption?.override_params || {};
  const params: Params = {...requestBody.params, ...overrideParams};
  const isStreamingMode = params.stream ? true : false;

  const provider:string = providerOption.provider ?? "";
  
  // Mapping providers to corresponding URLs
  const apiConfig: ProviderAPIConfig = Providers[provider].api;

  let baseUrl:string, endpoint:string, fetchOptions;
  if (provider=="azure-openai" && apiConfig.getBaseURL && apiConfig.getEndpoint) {
    // Construct the base object for the POST request
    if(!!providerOption.apiKey) {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey, "apiKey"), provider);
    } else {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.adAuth, "adAuth"), provider);
    }
    baseUrl = apiConfig.getBaseURL(providerOption.resourceName, providerOption.deploymentId);
    endpoint = apiConfig.getEndpoint(fn, providerOption.apiVersion);
  } else {
    // Construct the base object for the POST request
    fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey), provider);

    baseUrl = apiConfig.baseURL || "";
    endpoint = apiConfig[fn] || "";
  }

  // Construct the full URL
  const url = `${baseUrl}${endpoint}`;

  // Attach the body of the request
  const transformedRequestBody = transformToProviderRequest(provider, params, fn)

  fetchOptions.body = JSON.stringify(transformedRequestBody);

  let response:Response;
  let retryCount:number|undefined;

  if (!providerOption.retry) {
    providerOption.retry = {attempts: 1, onStatusCodes:[]}
  }

  const getFromCacheFunction = c.get('getFromCache');
  const cacheIdentifier = c.get('cacheIdentifier');
  const requestOptions = c.get('requestOptions') ?? [];
  let cacheResponse, cacheStatus;
  if (getFromCacheFunction) {
    [cacheResponse, cacheStatus] = await getFromCacheFunction(c.env, {...requestHeaders, ...fetchOptions.headers}, transformedRequestBody, fn, cacheIdentifier);
    if (cacheResponse) {
      response = await responseHandler(new Response(cacheResponse, {headers: {
        "content-type": "application/json"
      }}), isStreamingMode, provider, undefined);
      c.set("requestOptions", [...requestOptions, {
        providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
        requestParams: transformedRequestBody,
        response: response.clone(),
        cacheStatus: cacheStatus
      }])
      return response;
    }
  }

  [response, retryCount] = await retryRequest(url, fetchOptions, providerOption.retry.attempts, providerOption.retry.onStatusCodes);
  const mappedResponse = await responseHandler(response, isStreamingMode, provider, fn);

  c.set("requestOptions", [...requestOptions, {
    providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
    requestParams: transformedRequestBody,
    response: mappedResponse.clone(),
    cacheStatus: cacheStatus
  }])
  // If the response was not ok, throw an error
  if (!response.ok) {
    // Check if this request needs to be retried
    const errorObj: any = new Error(await mappedResponse.text());
    errorObj.status = mappedResponse.status;
    throw errorObj;
  }

  return mappedResponse;
}

/**
 * Tries providers in sequence until a successful response is received.
 * The providers are attempted in the order they are given in the providers parameter.
 * If all providers fail, an error is thrown with the details of the errors from each provider.
 *
 * @param {Options[]} providers - The providers to try. Each object in the array follows the Options interface and may contain a RetrySettings object for retry configuration.
 * @param {RequestBody} request - The request body.
 * @param {endpointStrings} fn - The function for the request.
 * @returns {Promise<CompletionResponse>} - The response from the first successful provider.
 * @throws Will throw an error if all providers fail.
 */
export async function tryProvidersInSequence(c: Context, providers:Options[], request: RequestBody, requestHeaders: Record<string, string>, fn: endpointStrings): Promise<Response> {
  let errors: any[] = [];
  for (let providerOption of providers) {
    try {
      if (fn === "proxy") {
        return await tryPostProxy(c, providerOption, request, requestHeaders, fn);
      }
      return await tryPost(c, providerOption, request, requestHeaders, fn);
    } catch (error:any) {
      // Log and store the error
      errors.push({
        provider: providerOption.provider,
        errorObj: error.message,
        status: error.status
      });
    }
  }
  // If we're here, all providers failed. Throw an error with the details.
  throw new Error(JSON.stringify(errors));
}

// Response Handlers for streaming & non-streaming
export function responseHandler(response: Response, streamingMode: boolean, proxyProvider: string, responseTransformer: string | undefined): Promise<Response> {
  // Checking status 200 so that errors are not considered as stream mode.
  let responseTransformerFunction: Function | undefined;
  if (responseTransformer && streamingMode && response.status === 200) {
    responseTransformerFunction = Providers[proxyProvider]?.responseTransforms?.[`stream-${responseTransformer}`];
  } else if (responseTransformer) {
    responseTransformerFunction = Providers[proxyProvider]?.responseTransforms?.[responseTransformer];
  }

  if (streamingMode && response.status === 200) {
      return handleStreamingMode(response, proxyProvider, responseTransformerFunction)
  } else {
      return handleNonStreamingMode(response, responseTransformerFunction)
  }
}