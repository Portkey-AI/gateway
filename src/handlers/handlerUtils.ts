import { Context } from 'hono';
import {
  AZURE_OPEN_AI,
  BEDROCK,
  WORKERS_AI,
  CONTENT_TYPES,
  HEADER_KEYS,
  POWERED_BY,
  RESPONSE_HEADER_KEYS,
  RETRY_STATUS_CODES,
  GOOGLE_VERTEX_AI,
  OPEN_AI,
} from '../globals';
import Providers from '../providers';
import { ProviderAPIConfig, endpointStrings } from '../providers/types';
import transformToProviderRequest from '../services/transformToProviderRequest';
import {
  Config,
  Options,
  Params,
  ShortConfig,
  Targets,
} from '../types/requestBody';
import { convertKeysToCamelCase } from '../utils';
import { retryRequest } from './retryHandler';
import {
  handleAudioResponse,
  handleImageResponse,
  handleJSONToStreamResponse,
  handleNonStreamingMode,
  handleOctetStreamResponse,
  handleStreamingMode,
  handleTextResponse,
} from './streamHandler';
import { env } from 'hono/adapter';
import { OpenAIChatCompleteJSONToStreamResponseTransform } from '../providers/openai/chatComplete';
import { OpenAICompleteJSONToStreamResponseTransform } from '../providers/openai/complete';

/**
 * Constructs the request options for the API call.
 *
 * @param {any} headers - The headers to add in the request.
 * @param {string} provider - The provider for the request.
 * @param {string} method - The HTTP method for the request.
 * @returns {RequestInit} - The fetch options for the request.
 */
export function constructRequest(
  providerConfigMappedHeaders: any,
  provider: string,
  method: string,
  forwardHeaders: string[],
  requestHeaders: Record<string, string>
) {
  let baseHeaders: any = {
    'content-type': 'application/json',
  };

  let headers: Record<string, string> = {};

  Object.keys(providerConfigMappedHeaders).forEach((h: string) => {
    headers[h.toLowerCase()] = providerConfigMappedHeaders[h];
  });

  const forwardHeadersMap: Record<string, string> = {};

  forwardHeaders.forEach((h: string) => {
    const lowerCaseHeaderKey = h.toLowerCase();
    if (requestHeaders[lowerCaseHeaderKey])
      forwardHeadersMap[lowerCaseHeaderKey] =
        requestHeaders[lowerCaseHeaderKey];
  });

  // Add any headers that the model might need
  headers = { ...baseHeaders, ...headers, ...forwardHeadersMap };

  let fetchOptions: RequestInit = {
    method,
    headers,
  };

  // If the method is GET, delete the content-type header
  if (method === 'GET' && fetchOptions.headers) {
    let headers = fetchOptions.headers as Record<string, unknown>;
    delete headers['content-type'];
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
export function selectProviderByWeight(providers: Options[]): Options {
  // Assign a default weight of 1 to providers with undefined weight
  providers = providers.map((provider) => ({
    ...provider,
    weight: provider.weight ?? 1,
  }));

  // Compute the total weight
  let totalWeight = providers.reduce(
    (sum: number, provider: any) => sum + provider.weight,
    0
  );

  // Select a random weight between 0 and totalWeight
  let randomWeight = Math.random() * totalWeight;

  // Find the provider that corresponds to the selected weight
  for (let [index, provider] of providers.entries()) {
    // @ts-ignore since weight is being default set above
    if (randomWeight < provider.weight) {
      return { ...provider, index };
    }
    // @ts-ignore since weight is being default set above
    randomWeight -= provider.weight;
  }

  throw new Error('No provider selected, please check the weights');
}

/**
 * @deprecated
 * Gets the provider options based on the specified mode.
 * Modes can be "single" (uses the first provider), "loadbalance" (selects one provider based on weights),
 * or "fallback" (uses all providers in the given order). If the mode does not match these options, null is returned.
 *
 * @param {string} mode - The mode for selecting providers.
 * @param {any} config - The configuration for the providers.
 * @returns {(Options[]|null)} - The selected provider options.
 */
export function getProviderOptionsByMode(
  mode: string,
  config: any
): Options[] | null {
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
    });
  }

  switch (mode) {
    case 'single':
      return [config.options[0]];
    case 'loadbalance':
      return [selectProviderByWeight(config.options)];
    case 'fallback':
      return config.options;
    default:
      return null;
  }
}

/**
 * @deprecated
 */
export const fetchProviderOptionsFromConfig = (
  config: Config | ShortConfig
): Options[] | null => {
  let providerOptions: Options[] | null = null;
  let mode: string;
  const camelCaseConfig = convertKeysToCamelCase(config, [
    'override_params',
    'params',
    'metadata',
  ]) as Config | ShortConfig;

  if ('provider' in camelCaseConfig) {
    providerOptions = [
      {
        provider: camelCaseConfig.provider,
        virtualKey: camelCaseConfig.virtualKey,
        apiKey: camelCaseConfig.apiKey,
        cache: camelCaseConfig.cache,
        retry: camelCaseConfig.retry,
        customHost: camelCaseConfig.customHost,
      },
    ];
    if (camelCaseConfig.resourceName)
      providerOptions[0].resourceName = camelCaseConfig.resourceName;
    if (camelCaseConfig.deploymentId)
      providerOptions[0].deploymentId = camelCaseConfig.deploymentId;
    if (camelCaseConfig.apiVersion)
      providerOptions[0].apiVersion = camelCaseConfig.apiVersion;
    if (camelCaseConfig.apiVersion)
      providerOptions[0].vertexProjectId = camelCaseConfig.vertexProjectId;
    if (camelCaseConfig.apiVersion)
      providerOptions[0].vertexRegion = camelCaseConfig.vertexRegion;
    if (camelCaseConfig.workersAiAccountId)
      providerOptions[0].workersAiAccountId =
        camelCaseConfig.workersAiAccountId;
    mode = 'single';
  } else {
    if (camelCaseConfig.strategy && camelCaseConfig.strategy.mode) {
      mode = camelCaseConfig.strategy.mode;
    } else {
      mode = camelCaseConfig.mode;
    }
    providerOptions = getProviderOptionsByMode(mode, camelCaseConfig);
  }
  return providerOptions;
};

/**
 * @deprecated
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
export async function tryPostProxy(
  c: Context,
  providerOption: Options,
  inputParams: Params,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  currentIndex: number,
  method: string = 'POST'
): Promise<Response> {
  const overrideParams = providerOption?.overrideParams || {};
  const params: Params = { ...inputParams, ...overrideParams };
  const isStreamingMode = params.stream ? true : false;

  const provider: string = providerOption.provider ?? '';

  // Mapping providers to corresponding URLs
  const apiConfig: ProviderAPIConfig = Providers[provider].api;

  const forwardHeaders: string[] = [];
  const customHost =
    requestHeaders[HEADER_KEYS.CUSTOM_HOST] || providerOption.customHost || '';
  const baseUrl =
    customHost || apiConfig.getBaseURL({ providerOptions: providerOption });
  const endpoint = apiConfig.getEndpoint({
    providerOptions: providerOption,
    fn,
    gatewayRequestBody: params,
  });

  const url = endpoint
    ? `${baseUrl}${endpoint}`
    : (providerOption.urlToFetch as string);

  const headers = await apiConfig.headers({
    providerOptions: providerOption,
    fn,
    transformedRequestBody: params,
    transformedRequestUrl: url,
  });

  const fetchOptions = constructRequest(
    headers,
    provider,
    method,
    forwardHeaders,
    requestHeaders
  );

  if (method === 'POST') {
    fetchOptions.body = JSON.stringify(params);
  }

  let response: Response;
  let retryCount: number | undefined;

  if (providerOption.retry && typeof providerOption.retry === 'object') {
    providerOption.retry = {
      attempts: providerOption.retry?.attempts ?? 0,
      onStatusCodes: providerOption.retry?.onStatusCodes ?? RETRY_STATUS_CODES,
    };
  } else if (typeof providerOption.retry === 'number') {
    providerOption.retry = {
      attempts: providerOption.retry,
      onStatusCodes: RETRY_STATUS_CODES,
    };
  } else {
    providerOption.retry = {
      attempts: 1,
      onStatusCodes: [],
    };
  }

  const getFromCacheFunction = c.get('getFromCache');
  const cacheIdentifier = c.get('cacheIdentifier');
  const requestOptions = c.get('requestOptions') ?? [];

  let cacheResponse, cacheKey, cacheMode, cacheMaxAge;
  let cacheStatus = 'DISABLED';

  if (requestHeaders[HEADER_KEYS.CACHE]) {
    cacheMode = requestHeaders[HEADER_KEYS.CACHE];
  } else if (
    providerOption?.cache &&
    typeof providerOption.cache === 'object' &&
    providerOption.cache.mode
  ) {
    cacheMode = providerOption.cache.mode;
    cacheMaxAge = providerOption.cache.maxAge;
  } else if (
    providerOption?.cache &&
    typeof providerOption.cache === 'string'
  ) {
    cacheMode = providerOption.cache;
  }

  if (getFromCacheFunction && cacheMode) {
    [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(
      env(c),
      { ...requestHeaders, ...fetchOptions.headers },
      params,
      url,
      cacheIdentifier,
      cacheMode,
      cacheMaxAge
    );
    if (cacheResponse) {
      response = await responseHandler(
        new Response(cacheResponse, {
          headers: {
            'content-type': 'application/json',
          },
        }),
        false,
        provider,
        undefined,
        url,
        false,
        params
      );
      c.set('requestOptions', [
        ...requestOptions,
        {
          providerOptions: {
            ...providerOption,
            requestURL: url,
            rubeusURL: fn,
          },
          requestParams: params,
          response: response.clone(),
          cacheStatus: cacheStatus,
          lastUsedOptionIndex: currentIndex,
          cacheKey: cacheKey,
          cacheMode: cacheMode,
          cacheMaxAge: cacheMaxAge,
        },
      ]);
      updateResponseHeaders(
        response,
        currentIndex,
        params,
        cacheStatus,
        0,
        requestHeaders[HEADER_KEYS.TRACE_ID] ?? ''
      );
      return response;
    }
  }

  [response, retryCount] = await retryRequest(
    url,
    fetchOptions,
    providerOption.retry.attempts,
    providerOption.retry.onStatusCodes,
    null
  );
  const mappedResponse = await responseHandler(
    response,
    isStreamingMode,
    provider,
    undefined,
    url,
    false,
    params
  );
  updateResponseHeaders(
    mappedResponse,
    currentIndex,
    params,
    cacheStatus,
    retryCount ?? 0,
    requestHeaders[HEADER_KEYS.TRACE_ID] ?? ''
  );

  c.set('requestOptions', [
    ...requestOptions,
    {
      providerOptions: {
        ...providerOption,
        requestURL: url,
        rubeusURL: fn,
      },
      requestParams: params,
      response: mappedResponse.clone(),
      cacheStatus: cacheStatus,
      lastUsedOptionIndex: currentIndex,
      cacheKey: cacheKey,
      cacheMode: cacheMode,
    },
  ]);
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
export async function tryPost(
  c: Context,
  providerOption: Options,
  inputParams: Params,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  currentIndex: number | string
): Promise<Response> {
  const overrideParams = providerOption?.overrideParams || {};
  const params: Params = { ...inputParams, ...overrideParams };
  const isStreamingMode = params.stream ? true : false;

  const provider: string = providerOption.provider ?? '';

  // Mapping providers to corresponding URLs
  const apiConfig: ProviderAPIConfig = Providers[provider].api;
  // Attach the body of the request
  const transformedRequestBody = transformToProviderRequest(
    provider,
    params,
    fn
  );

  const forwardHeaders =
    requestHeaders[HEADER_KEYS.FORWARD_HEADERS]
      ?.split(',')
      .map((h) => h.trim()) ||
    providerOption.forwardHeaders ||
    [];

  const customHost =
    requestHeaders[HEADER_KEYS.CUSTOM_HOST] || providerOption.customHost || '';

  const baseUrl =
    customHost || apiConfig.getBaseURL({ providerOptions: providerOption });
  const endpoint = apiConfig.getEndpoint({
    providerOptions: providerOption,
    fn,
    gatewayRequestBody: params,
  });
  const url = `${baseUrl}${endpoint}`;

  const headers = await apiConfig.headers({
    providerOptions: providerOption,
    fn,
    transformedRequestBody,
    transformedRequestUrl: url,
  });

  // Construct the base object for the POST request
  const fetchOptions = constructRequest(
    headers,
    provider,
    'POST',
    forwardHeaders,
    requestHeaders
  );

  fetchOptions.body = JSON.stringify(transformedRequestBody);

  let response: Response;
  let retryCount: number | undefined;

  providerOption.retry = {
    attempts: providerOption.retry?.attempts ?? 0,
    onStatusCodes: providerOption.retry?.onStatusCodes ?? RETRY_STATUS_CODES,
  };

  const [
    getFromCacheFunction,
    cacheIdentifier,
    requestOptions,
    preRequestValidator,
  ] = [
    c.get('getFromCache'),
    c.get('cacheIdentifier'),
    c.get('requestOptions') ?? [],
    c.get('preRequestValidator'),
  ];

  let cacheResponse, cacheKey, cacheMode, cacheMaxAge;
  let cacheStatus = 'DISABLED';

  if (typeof providerOption.cache === 'object' && providerOption.cache?.mode) {
    cacheMode = providerOption.cache.mode;
    cacheMaxAge = providerOption.cache.maxAge;
  } else if (typeof providerOption.cache === 'string') {
    cacheMode = providerOption.cache;
  }

  if (getFromCacheFunction && cacheMode) {
    [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(
      env(c),
      { ...requestHeaders, ...fetchOptions.headers },
      transformedRequestBody,
      fn,
      cacheIdentifier,
      cacheMode,
      cacheMaxAge
    );
    if (cacheResponse) {
      response = await responseHandler(
        new Response(cacheResponse, {
          headers: { 'content-type': 'application/json' },
        }),
        isStreamingMode,
        provider,
        fn,
        url,
        true,
        params
      );
      c.set('requestOptions', [
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
        requestHeaders[HEADER_KEYS.TRACE_ID] ?? ''
      );

      return response;
    }
  }

  response = preRequestValidator
    ? preRequestValidator(providerOption, requestHeaders)
    : undefined;

  if (!response) {
    [response, retryCount] = await retryRequest(
      url,
      fetchOptions,
      providerOption.retry.attempts,
      providerOption.retry.onStatusCodes,
      providerOption.requestTimeout || null
    );
  }

  const mappedResponse = await responseHandler(
    response,
    isStreamingMode,
    provider,
    fn,
    url,
    false,
    params
  );
  updateResponseHeaders(
    mappedResponse,
    currentIndex,
    params,
    cacheStatus,
    retryCount ?? 0,
    requestHeaders[HEADER_KEYS.TRACE_ID] ?? ''
  );
  c.set('requestOptions', [
    ...requestOptions,
    {
      providerOptions: {
        ...providerOption,
        requestURL: url,
        rubeusURL: fn,
      },
      requestParams: transformedRequestBody,
      response: mappedResponse.clone(),
      cacheStatus: cacheStatus,
      lastUsedOptionIndex: currentIndex,
      cacheKey: cacheKey,
      cacheMode: cacheMode,
      cacheMaxAge: cacheMaxAge,
    },
  ]);
  // If the response was not ok, throw an error
  if (!response.ok) {
    // Check if this request needs to be retried
    const errorObj: any = new Error(await mappedResponse.clone().text());
    errorObj.status = mappedResponse.status;
    errorObj.response = mappedResponse;
    throw errorObj;
  }

  return mappedResponse;
}

/**
 * @deprecated
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
export async function tryProvidersInSequence(
  c: Context,
  providers: Options[],
  params: Params,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  method: string = 'POST'
): Promise<Response> {
  let errors: any[] = [];
  for (let [index, providerOption] of providers.entries()) {
    try {
      const loadbalanceIndex = !isNaN(Number(providerOption.index))
        ? Number(providerOption.index)
        : null;
      if (fn === 'proxy') {
        return await tryPostProxy(
          c,
          providerOption,
          params,
          requestHeaders,
          fn,
          loadbalanceIndex ?? index,
          method
        );
      }
      return await tryPost(
        c,
        providerOption,
        params,
        requestHeaders,
        fn,
        loadbalanceIndex ?? index
      );
    } catch (error: any) {
      // Log and store the error
      errors.push({
        provider: providerOption.provider,
        errorObj: error.message,
        status: error.status,
      });
    }
  }
  // If we're here, all providers failed. Throw an error with the details.
  throw new Error(JSON.stringify(errors));
}

/**
 * Handles various types of responses based on the specified parameters
 * and returns a mapped response
 * @param {Response} response - The HTTP response received from LLM.
 * @param {boolean} streamingMode - Indicates whether streaming mode is enabled.
 * @param {string} proxyProvider - The provider string.
 * @param {string | undefined} responseTransformer - The response transformer to determine type of call.
 * @param {string} requestURL - The URL of the original LLM request.
 * @param {boolean} [isCacheHit=false] - Indicates whether the response is a cache hit.
 * @returns {Promise<Response>} - A promise that resolves to the processed response.
 */
export function responseHandler(
  response: Response,
  streamingMode: boolean,
  proxyProvider: string,
  responseTransformer: string | undefined,
  requestURL: string,
  isCacheHit: boolean = false,
  gatewayRequest: Params
): Promise<Response> {
  let responseTransformerFunction: Function | undefined;
  const responseContentType = response.headers?.get('content-type');

  const providerConfig = Providers[proxyProvider];
  let providerTransformers = Providers[proxyProvider]?.responseTransforms;

  if (providerConfig.getConfig) {
    providerTransformers =
      providerConfig.getConfig(gatewayRequest).responseTransforms;
  }

  // Checking status 200 so that errors are not considered as stream mode.
  if (responseTransformer && streamingMode && response.status === 200) {
    responseTransformerFunction =
      providerTransformers?.[`stream-${responseTransformer}`];
  } else if (responseTransformer) {
    responseTransformerFunction = providerTransformers?.[responseTransformer];
  }

  // JSON to text/event-stream conversion is only allowed for unified routes: chat completions and completions.
  // Set the transformer to OpenAI json to stream convertor function in that case.
  if (responseTransformer && streamingMode && isCacheHit) {
    responseTransformerFunction =
      responseTransformer === 'chatComplete'
        ? OpenAIChatCompleteJSONToStreamResponseTransform
        : OpenAICompleteJSONToStreamResponseTransform;
  } else if (responseTransformer && !streamingMode && isCacheHit) {
    responseTransformerFunction = undefined;
  }
  if (
    streamingMode &&
    response.status === 200 &&
    isCacheHit &&
    responseTransformerFunction
  ) {
    return handleJSONToStreamResponse(
      response,
      proxyProvider,
      responseTransformerFunction
    );
  } else if (streamingMode && response.status === 200) {
    return handleStreamingMode(
      response,
      proxyProvider,
      responseTransformerFunction,
      requestURL
    );
  } else if (
    responseContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)
  ) {
    return handleAudioResponse(response);
  } else if (responseContentType === CONTENT_TYPES.APPLICATION_OCTET_STREAM) {
    return handleOctetStreamResponse(response);
  } else if (
    responseContentType?.startsWith(CONTENT_TYPES.GENERIC_IMAGE_PATTERN)
  ) {
    return handleImageResponse(response);
  } else if (
    responseContentType?.startsWith(CONTENT_TYPES.PLAIN_TEXT) ||
    responseContentType?.startsWith(CONTENT_TYPES.HTML)
  ) {
    return handleTextResponse(response, responseTransformerFunction);
  } else {
    return handleNonStreamingMode(response, responseTransformerFunction);
  }
}

export async function tryTargetsRecursively(
  c: Context,
  targetGroup: Targets,
  request: Params,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  method: string,
  jsonPath: string,
  inheritedConfig: Record<string, any> = {}
): Promise<Response> {
  let currentTarget: any = { ...targetGroup };
  let currentJsonPath = jsonPath;
  const strategyMode = currentTarget.strategy?.mode;

  // start: merge inherited config with current target config (preference given to current)
  const currentInheritedConfig: Record<string, any> = {
    overrideParams: {
      ...inheritedConfig.overrideParams,
      ...currentTarget.overrideParams,
    },
    retry: currentTarget.retry
      ? { ...currentTarget.retry }
      : { ...inheritedConfig.retry },
    cache: currentTarget.cache
      ? { ...currentTarget.cache }
      : { ...inheritedConfig.cache },
    requestTimeout: null,
  };

  if (currentTarget.forwardHeaders) {
    currentInheritedConfig.forwardHeaders = [...currentTarget.forwardHeaders];
  } else if (inheritedConfig.forwardHeaders) {
    currentInheritedConfig.forwardHeaders = [...inheritedConfig.forwardHeaders];
    currentTarget.forwardHeaders = [...inheritedConfig.forwardHeaders];
  }

  if (currentTarget.customHost) {
    currentInheritedConfig.customHost = currentTarget.customHost;
  } else if (inheritedConfig.customHost) {
    currentInheritedConfig.customHost = inheritedConfig.customHost;
    currentTarget.customHost = inheritedConfig.customHost;
  }

  if (currentTarget.requestTimeout) {
    currentInheritedConfig.requestTimeout = currentTarget.requestTimeout;
  } else if (inheritedConfig.requestTimeout) {
    currentInheritedConfig.requestTimeout = inheritedConfig.requestTimeout;
    currentTarget.requestTimeout = inheritedConfig.requestTimeout;
  }

  currentTarget.overrideParams = {
    ...currentInheritedConfig.overrideParams,
  };

  currentTarget.retry = {
    ...currentInheritedConfig.retry,
  };

  currentTarget.cache = {
    ...currentInheritedConfig.cache,
  };
  // end: merge inherited config with current target config (preference given to current)

  let response;

  switch (strategyMode) {
    case 'fallback':
      for (let [index, target] of currentTarget.targets.entries()) {
        response = await tryTargetsRecursively(
          c,
          target,
          request,
          requestHeaders,
          fn,
          method,
          `${currentJsonPath}.targets[${index}]`,
          currentInheritedConfig
        );
        if (
          response?.ok ||
          (currentTarget.strategy.onStatusCodes &&
            !currentTarget.strategy.onStatusCodes.includes(response?.status))
        ) {
          break;
        }
      }
      break;

    case 'loadbalance':
      currentTarget.targets.forEach((t: Options) => {
        if (t.weight === undefined) {
          t.weight = 1;
        }
      });
      let totalWeight = currentTarget.targets.reduce(
        (sum: number, provider: any) => sum + provider.weight,
        0
      );

      let randomWeight = Math.random() * totalWeight;
      for (let [index, provider] of currentTarget.targets.entries()) {
        if (randomWeight < provider.weight) {
          currentJsonPath = currentJsonPath + `.targets[${index}]`;
          response = await tryTargetsRecursively(
            c,
            provider,
            request,
            requestHeaders,
            fn,
            method,
            currentJsonPath,
            currentInheritedConfig
          );
          break;
        }
        randomWeight -= provider.weight;
      }
      break;

    case 'single':
      response = await tryTargetsRecursively(
        c,
        currentTarget.targets[0],
        request,
        requestHeaders,
        fn,
        method,
        `${currentJsonPath}.targets[0]`,
        currentInheritedConfig
      );
      break;

    default:
      try {
        response = await tryPost(
          c,
          currentTarget,
          request,
          requestHeaders,
          fn,
          currentJsonPath
        );
      } catch (error: any) {
        response = error.response;
      }
      break;
  }

  return response;
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

  response.headers.append(RESPONSE_HEADER_KEYS.CACHE_STATUS, cacheStatus);
  response.headers.append(RESPONSE_HEADER_KEYS.TRACE_ID, traceId);
  response.headers.append(
    RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT,
    retryAttempt.toString()
  );

  const contentEncodingHeader = response.headers.get('content-encoding');
  if (contentEncodingHeader && contentEncodingHeader.indexOf('br') > -1) {
    // Brotli compression causes errors at runtime, removing the header in that case
    response.headers.delete('content-encoding');
  }

  // Delete content-length header to avoid conflicts with hono compress middleware
  // workerd environment handles this authomatically
  response.headers.delete('content-length');
}

export function constructConfigFromRequestHeaders(
  requestHeaders: Record<string, any>
): Options | Targets {
  const azureConfig = {
    resourceName: requestHeaders[`x-${POWERED_BY}-azure-resource-name`],
    deploymentId: requestHeaders[`x-${POWERED_BY}-azure-deployment-id`],
    apiVersion: requestHeaders[`x-${POWERED_BY}-azure-api-version`],
  };

  const bedrockConfig = {
    awsAccessKeyId: requestHeaders[`x-${POWERED_BY}-aws-access-key-id`],
    awsSecretAccessKey: requestHeaders[`x-${POWERED_BY}-aws-secret-access-key`],
    awsSessionToken: requestHeaders[`x-${POWERED_BY}-aws-session-token`],
    awsRegion: requestHeaders[`x-${POWERED_BY}-aws-region`],
  };

  const workersAiConfig = {
    workersAiAccountId: requestHeaders[`x-${POWERED_BY}-workers-ai-account-id`],
  };

  const openAiConfig = {
    openaiOrganization: requestHeaders[`x-${POWERED_BY}-openai-organization`],
    openaiProject: requestHeaders[`x-${POWERED_BY}-openai-project`],
  };

  const vertexConfig = {
    vertexProjectId: requestHeaders[`x-${POWERED_BY}-vertex-project-id`],
    vertexRegion: requestHeaders[`x-${POWERED_BY}-vertex-region`],
  };

  if (requestHeaders[`x-${POWERED_BY}-config`]) {
    let parsedConfigJson = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);

    if (!parsedConfigJson.provider && !parsedConfigJson.targets) {
      parsedConfigJson.provider = requestHeaders[`x-${POWERED_BY}-provider`];
      parsedConfigJson.api_key = requestHeaders['authorization']?.replace(
        'Bearer ',
        ''
      );

      if (parsedConfigJson.provider === AZURE_OPEN_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...azureConfig,
        };
      }

      if (parsedConfigJson.provider === BEDROCK) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...bedrockConfig,
        };
      }

      if (parsedConfigJson.provider === WORKERS_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...workersAiConfig,
        };
      }

      if (parsedConfigJson.provider === OPEN_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...openAiConfig,
        };
      }
    }
    return convertKeysToCamelCase(parsedConfigJson, [
      'override_params',
      'params',
    ]) as any;
  }

  return {
    provider: requestHeaders[`x-${POWERED_BY}-provider`],
    apiKey: requestHeaders['authorization']?.replace('Bearer ', ''),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === AZURE_OPEN_AI &&
      azureConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === BEDROCK &&
      bedrockConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === WORKERS_AI &&
      workersAiConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === GOOGLE_VERTEX_AI &&
      vertexConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === OPEN_AI && openAiConfig),
  };
}
