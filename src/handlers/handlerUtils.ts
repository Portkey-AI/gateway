import { Context } from "hono";
import { AZURE_OPEN_AI, HEADER_KEYS, POWERED_BY, RESPONSE_HEADER_KEYS } from "../globals";
import Providers from "../providers";
import { ProviderAPIConfig, endpointStrings } from "../providers/types";
import transformToProviderRequest from "../services/transformToProviderRequest";
import { Config, Options, Params, RequestBody, ShortConfig, Targets } from "../types/requestBody";
import { convertKeysToCamelCase } from "../utils";
import { retryRequest } from "./retryHandler";
import { handleAudioResponse, handleNonStreamingMode, handleOctetStreamResponse, handleStreamingMode } from "./streamHandler";

/**
 * Constructs the request options for the API call.
 *
 * @param {any} headers - The headers to add in the request.
 * @param {string} provider - The provider for the request.
 * @param {string} method - The HTTP method for the request.
 * @returns {RequestInit} - The fetch options for the request.
 */
export function constructRequest(headers: any, provider: string = "", method: string = "POST") {
  let baseHeaders: any = {
    "content-type": "application/json"
  };

  // Add any headers that the model might need
  headers = {...baseHeaders, ...headers}
  
  let fetchOptions: RequestInit = {
    method,
    headers,
  };

  // If the method is GET, delete the content-type header
  if (method === "GET" && fetchOptions.headers) {
    let headers = fetchOptions.headers as Record<string, unknown>;
    delete headers["content-type"];
  }

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
  for (let [index, provider] of providers.entries()) {
    // @ts-ignore since weight is being default set above
    if (randomWeight < provider.weight) {
      return {...provider, index};
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
  if (config.targets) {
    config.options = config.targets;
  }
  
  if (config.options) {
    // Inherit cache and retry from top level if not present on option level
    config.options.forEach((configOption: any) => {
      if (config.cache && !configOption.cache) {
        configOption.cache = config.cache;
      }
      if (config.retry && !configOption.retry) {
        configOption.retry = config.retry;
      }
    })
  }

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

export const fetchProviderOptionsFromConfig = (config: Config | ShortConfig): Options[] | null => {
  let providerOptions: Options[] | null = null;
  let mode: string;
  const camelCaseConfig  = convertKeysToCamelCase(config, ["override_params", "params", "metadata"]) as Config | ShortConfig;

  if ('provider' in camelCaseConfig) {
      providerOptions = [{
      provider: camelCaseConfig.provider, 
      virtualKey: camelCaseConfig.virtualKey, 
      apiKey: camelCaseConfig.apiKey,
      cache: camelCaseConfig.cache,
      retry: camelCaseConfig.retry
      }];
      mode = "single";
  } else {
      if (camelCaseConfig.strategy && camelCaseConfig.strategy.mode) {
        mode = camelCaseConfig.strategy.mode;
      } else {
        mode = camelCaseConfig.mode;
      }
      providerOptions = getProviderOptionsByMode(mode, camelCaseConfig);
  }
  return providerOptions;
}

/**
 * Makes a request (GET or POST) to a provider and returns the response.
 * The request is constructed using the provider, apiKey, and requestBody parameters.
 * The fn parameter is the type of request being made (e.g., "complete", "chatComplete").
 *
 * @param {Options} providerOption - The provider options. This object follows the Options interface and may contain a RetrySettings object for retry configuration.
 * @param {RequestBody} requestBody - The request body.
 * @param {string} fn - The function for the request.
 * @param {string} method - The method for the request (GET, POST).
 * @returns {Promise<CompletionResponse>} - The response from the request.
 * @throws Will throw an error if the response is not ok or if all retry attempts fail.
 */
export async function tryPostProxy(c: Context, providerOption:Options, inputParams: Params, requestHeaders: Record<string, string>, fn: endpointStrings, currentIndex: number, method:string="POST"): Promise<Response> {
  const overrideParams = providerOption?.overrideParams || {};
  const params: Params = {...inputParams, ...overrideParams};
  const isStreamingMode = params.stream ? true : false;

  const provider:string = providerOption.provider ?? "";
  
  // Mapping providers to corresponding URLs
  const apiConfig: ProviderAPIConfig = Providers[provider].api;
  let fetchOptions;
  let url = providerOption.urlToFetch as string;

  let baseUrl:string, endpoint:string;
  if (provider=="azure-openai" && apiConfig.getBaseURL && apiConfig.getEndpoint) {
    // Construct the base object for the request
    if(!!providerOption.apiKey) {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey, "apiKey"), provider, method);
    } else {
      fetchOptions = constructRequest(apiConfig.headers(providerOption.adAuth, "adAuth"), provider, method);
    }
    baseUrl = apiConfig.getBaseURL(providerOption.resourceName, providerOption.deploymentId);
    endpoint = apiConfig.getEndpoint(fn, providerOption.apiVersion, url);
    url = `${baseUrl}${endpoint}`;
  } else if (provider === "palm" && apiConfig.baseURL && apiConfig.getEndpoint) {
    fetchOptions = constructRequest(apiConfig.headers(), provider, method);
    baseUrl = apiConfig.baseURL;
    endpoint = apiConfig.getEndpoint(fn, providerOption.apiKey, providerOption.overrideParams?.model || params?.model);
    url = `${baseUrl}${endpoint}`;
  } else {
    // Construct the base object for the request
    fetchOptions = constructRequest(apiConfig.headers(providerOption.apiKey), provider, method);
  }
  if (method === "POST") {
    fetchOptions.body = JSON.stringify(params)
  }

  let response:Response;
  let retryCount:number|undefined;

  if (!providerOption.retry) {
    providerOption.retry = {attempts: 1, onStatusCodes:[]}
  }

  const getFromCacheFunction = c.get('getFromCache');
  const cacheIdentifier = c.get('cacheIdentifier');
  const requestOptions = c.get('requestOptions') ?? [];
  let cacheResponse, cacheStatus, cacheKey, cacheMode;
  if (getFromCacheFunction) {
    [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(
        c.env,
        { ...requestHeaders, ...fetchOptions.headers },
        params,
        url,
        cacheIdentifier,
        cacheMode
    );
    if (cacheResponse) {
      response = await responseHandler(new Response(cacheResponse, {headers: {
        "content-type": "application/json"
      }}), false, provider, undefined);
      c.set("requestOptions", [...requestOptions, {
        providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
        requestParams: params,
        response: response.clone(),
        cacheStatus: cacheStatus,
        lastUsedOptionIndex: currentIndex,
        cacheKey: cacheKey,
        cacheMode: cacheMode
      }])
      updateResponseHeaders(response, currentIndex, params, cacheStatus, 0, requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");
      return response;
    }
  }

    [response, retryCount] = await retryRequest(url, fetchOptions, providerOption.retry.attempts, providerOption.retry.onStatusCodes);
  const mappedResponse = await responseHandler(response, isStreamingMode, provider, undefined);
  updateResponseHeaders(mappedResponse, currentIndex, params, cacheStatus, retryCount ?? 0, requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");

  c.set("requestOptions", [...requestOptions, {
    providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
    requestParams: params,
    response: mappedResponse.clone(),
    cacheStatus: cacheStatus,
    lastUsedOptionIndex: currentIndex,
    cacheKey: cacheKey
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
export async function tryPost(c: Context, providerOption:Options, inputParams: Params, requestHeaders: Record<string, string>, fn: endpointStrings, currentIndex: number | string): Promise<Response> {
  const overrideParams = providerOption?.overrideParams || {};
  const params: Params = {...inputParams, ...overrideParams};
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
  } else if (provider === "palm" && apiConfig.baseURL && apiConfig.getEndpoint) {
    fetchOptions = constructRequest(apiConfig.headers(), provider);
    baseUrl = apiConfig.baseURL;
    endpoint = apiConfig.getEndpoint(fn, providerOption.apiKey, providerOption.overrideParams?.model || params?.model);
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

  providerOption.retry = {
    attempts: providerOption.retry?.attempts ?? 1,
    onStatusCodes: providerOption.retry?.onStatusCodes ?? []
  }

  const [getFromCacheFunction, cacheIdentifier, requestOptions] = [
      c.get("getFromCache"),
      c.get("cacheIdentifier"),
      c.get("requestOptions") ?? [],
  ];

  let cacheResponse, cacheKey, cacheMode;
  let cacheStatus = "DISABLED";

  if (typeof providerOption.cache === "object" && providerOption.cache?.mode) {
    cacheMode = providerOption.cache.mode;
  } else if (typeof providerOption.cache === "string") {
    cacheMode = providerOption.cache
  }

  if (getFromCacheFunction && cacheMode) {
      [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(
          c.env,
          { ...requestHeaders, ...fetchOptions.headers },
          transformedRequestBody,
          fn,
          cacheIdentifier,
          cacheMode
      );
      if (cacheResponse) {
          response = await responseHandler(
              new Response(cacheResponse, {
                  headers: {
                      "content-type": "application/json",
                  },
              }),
              false,
              provider,
              undefined
          );
          c.set("requestOptions", [
              ...requestOptions,
              {
                  providerOptions: {
                      ...providerOption,
                      requestURL: url,
                      rubeusURL: fn,
                  },
                  requestParams: transformedRequestBody,
                  response: response.clone(),
                  cacheStatus: cacheStatus,
                  lastUsedOptionIndex: currentIndex,
                  cacheKey: cacheKey,
                  cacheMode: cacheMode,
              },
          ]);
          updateResponseHeaders(
              response,
              currentIndex,
              params,
              cacheStatus,
              0,
              requestHeaders[HEADER_KEYS.TRACE_ID] ?? ""
          );

          return response;
      }
  }

  [response, retryCount] = await retryRequest(url, fetchOptions, providerOption.retry.attempts, providerOption.retry.onStatusCodes);

  const mappedResponse = await responseHandler(response, isStreamingMode, provider, fn);
  updateResponseHeaders(mappedResponse, currentIndex, params, cacheStatus, retryCount ?? 0, requestHeaders[HEADER_KEYS.TRACE_ID] ?? "");
  c.set("requestOptions", [...requestOptions, {
    providerOptions: {...providerOption, requestURL: url, rubeusURL: fn},
    requestParams: transformedRequestBody,
    response: mappedResponse.clone(),
    cacheStatus: cacheStatus,
    lastUsedOptionIndex: currentIndex,
    cacheKey: cacheKey,
    cacheMode: cacheMode
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
 * @param {String} method - The method to be used (GET, POST) for the request.
 * @returns {Promise<CompletionResponse>} - The response from the first successful provider.
 * @throws Will throw an error if all providers fail.
 */
export async function tryProvidersInSequence(c: Context, providers:Options[], params: Params, requestHeaders: Record<string, string>, fn: endpointStrings, method:string="POST"): Promise<Response> {
  let errors: any[] = [];
  for (let [index, providerOption] of providers.entries()) {
    try {
      const loadbalanceIndex = !isNaN(Number(providerOption.index)) ? Number(providerOption.index) : null
      if (fn === "proxy") {
        return await tryPostProxy(c, providerOption, params, requestHeaders, fn, loadbalanceIndex ?? index, method);
      }
      return await tryPost(c, providerOption, params, requestHeaders, fn, loadbalanceIndex ?? index);
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
  } else if (response.headers?.get("content-type") === "audio/mpeg") {
      return handleAudioResponse(response)
  } else if (response.headers?.get("content-type") === "application/octet-stream") {
      return handleOctetStreamResponse(response)
  } else {
      return handleNonStreamingMode(response, responseTransformerFunction)
  } 
}

export async function tryTargetsRecursively(
    c: Context,
    targetGroup: Targets,
    request: Params,
    requestHeaders: Record<string, string>,
    fn: endpointStrings,
    method: string = "POST",
    errors: any,
    jsonPath: string = "config",
    inheritedConfig: Record<string, any> = {}
): Promise<Response | undefined> {
    let currentTarget: any = {...targetGroup};
    let currentJsonPath = jsonPath;
    const currentInheritedConfig = {
      overrideParams : {
        ...inheritedConfig.overrideParams,
        ...currentTarget.overrideParams
      },
      retry: null,
      cache: null
    }
    currentTarget.overrideParams = {
        ...currentInheritedConfig.overrideParams
    }

    if (!currentTarget.targets && inheritedConfig.retry && !currentTarget.retry) {
      currentTarget.retry = {
        ...inheritedConfig.retry
      }
    } else if (currentTarget.targets && currentTarget.retry) {
      currentInheritedConfig.retry = {
        ...currentTarget.retry
      }
    }
    if (!currentTarget.targets && inheritedConfig.cache && !currentTarget.cache) {
      currentTarget.cache = {
        ...inheritedConfig.cache
      }
    } else if (currentTarget.targets && currentTarget.cache) {
      currentInheritedConfig.cache = {
        ...currentTarget.cache,
        
      }
    }

    try {
        if (currentTarget.strategy?.mode === "fallback") {
            for (let [index, target] of currentTarget.targets.entries()) {
                if (target.targets) {
                    return await tryTargetsRecursively(
                        c,
                        target,
                        request,
                        requestHeaders,
                        fn,
                        method,
                        errors,
                        `${currentJsonPath}.targets[${index}]`,
                        currentInheritedConfig
                    );
                }
                try {
                    return await tryPost(
                        c,
                        target,
                        request,
                        requestHeaders,
                        fn,
                        `${currentJsonPath}.targets[${index}]`
                    );
                } catch (e: any) {
                  errors.push({
                      provider: target.provider,
                      errorObj: e.message,
                      status: e.status,
                  });
                  if (currentTarget.strategy.onStatusCodes && !currentTarget.strategy.onStatusCodes.includes(e.status)) {
                    break;
                  }
                }
            }
        } else if (currentTarget.strategy?.mode === "loadbalance") {
          currentTarget.targets.forEach(
            (t: Options) => {
              if (!t.weight) {
                t.weight = 1;
              }
            }
          );
            let totalWeight = currentTarget.targets.reduce(
                (sum: number, provider: any) => sum + provider.weight,
                0
            );

            let randomWeight = Math.random() * totalWeight;
            for (let [index, provider] of currentTarget.targets.entries()) {
                if (randomWeight < provider.weight) {
                    currentJsonPath = currentJsonPath + `.targets[${index}]`;
                    if (provider.targets) {
                      return await tryTargetsRecursively(
                          c,
                          provider,
                          request,
                          requestHeaders,
                          fn,
                          method,
                          errors,
                          currentJsonPath,
                          currentInheritedConfig
                      );
                    }
                    return await tryPost(
                        c,
                        provider,
                        request,
                        requestHeaders,
                        fn,
                        currentJsonPath
                    );
                }
                randomWeight -= provider.weight;
            }
        } else {
          return await tryPost(
              c,
              currentTarget,
              request,
              requestHeaders,
              fn,
              currentJsonPath
          );
        }
    } catch (error: any) {
        errors.push({
            provider: targetGroup.provider,
            errorObj: error.message,
            status: error.status,
        });
    }

    return;
}


export function updateResponseHeaders(
    response: Response,
    currentIndex: string | number,
    params: Record<string, any>,
    cacheStatus: string,
    retryAttempt: number,
    traceId: string
) {
    response.headers.append(
        RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX,
        currentIndex.toString()
    );
    // response.headers.append(
    //     RESPONSE_HEADER_KEYS.LAST_USED_OPTION_PARAMS,
    //     JSON.stringify(params).slice(0, 2000)
    // );
    response.headers.append(RESPONSE_HEADER_KEYS.CACHE_STATUS, cacheStatus);
    response.headers.append(RESPONSE_HEADER_KEYS.TRACE_ID, traceId);
    response.headers.append(
        RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT,
        retryAttempt.toString()
    );
}

export function constructConfigFromRequestHeaders(
    requestHeaders: Record<string, any>
): Options | Targets {
    const azureConfig = {
      resourceName: requestHeaders[`x-${POWERED_BY}-azure-resource-name`],
      deploymentId: requestHeaders[`x-${POWERED_BY}-azure-deployment-id`],
      apiVersion: requestHeaders[`x-${POWERED_BY}-azure-api-version`]
    }

    if (
      requestHeaders[`x-${POWERED_BY}-config`]
    ) {
        let parsedConfigJson = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);

        if (!parsedConfigJson.provider && !parsedConfigJson.targets) {
          parsedConfigJson.provider = requestHeaders[`x-${POWERED_BY}-provider`];
          parsedConfigJson.api_key = requestHeaders["authorization"]?.replace("Bearer ", "");
          if (parsedConfigJson.provider === AZURE_OPEN_AI) {
            parsedConfigJson = {
              ...parsedConfigJson,
              ...azureConfig
            }
          }
        }
        return convertKeysToCamelCase(
            parsedConfigJson,
            ["override_params", "params"]
        ) as any;
    }

    return {
      provider: requestHeaders[`x-${POWERED_BY}-provider`],
      apiKey: requestHeaders["authorization"]?.replace("Bearer ", ""),
      ...(requestHeaders[`x-${POWERED_BY}-provider`] === AZURE_OPEN_AI && azureConfig)
    };
}
    