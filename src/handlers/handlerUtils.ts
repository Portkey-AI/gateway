import { Context } from 'hono';
import {
  AZURE_OPEN_AI,
  HEADER_KEYS,
  POWERED_BY,
  RESPONSE_HEADER_KEYS,
  RETRY_STATUS_CODES,
  ANTHROPIC,
  CONTENT_TYPES,
  METRICS_KEYS,
} from '../globals';
import Providers from '../providers';
import { ProviderAPIConfig, endpointStrings } from '../providers/types';
import transformToProviderRequest from '../services/transformToProviderRequest';
import { Options, Params, StrategyModes, Targets } from '../types/requestBody';
import { convertKeysToCamelCase } from '../utils';
import { retryRequest } from './retryHandler';
import { env, getRuntimeKey } from 'hono/adapter';
import { afterRequestHookHandler, responseHandler } from './responseHandlers';
import { stickySessionManager } from '../services/stickySessionManager';
import { HookSpan, HooksManager } from '../middlewares/hooks';
import { ConditionalRouter } from '../services/conditionalRouter';
import { RouterError } from '../errors/RouterError';
import { GatewayError } from '../errors/GatewayError';
import { HookType } from '../middlewares/hooks/types';
import { logger } from '../apm';
import { Readable } from 'stream';
import { externalServiceFetch, internalServiceFetch } from '../utils/fetch';
import {
  applyAdapterRequestTransform,
  adaptResponse,
  AdapterContext,
} from './adapterUtils';

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
  requestHeaders: Record<string, string>,
  fn: endpointStrings
) {
  const proxyHeaders: Record<string, string> = {};
  // Handle proxy headers
  if (fn === 'proxy') {
    const poweredByHeadersPattern = `x-${POWERED_BY}-`;
    const headersToAvoidForCloudflare = ['expect'];
    const headersToIgnore = [
      'x-auth-organisation-details',
      ...headersToAvoidForCloudflare,
    ];
    headersToIgnore.push('content-length');
    Object.keys(requestHeaders).forEach((key: string) => {
      if (
        !headersToIgnore.includes(key) &&
        !key.startsWith(poweredByHeadersPattern)
      ) {
        proxyHeaders[key] = requestHeaders[key];
      }
    });
    // Remove brotli from accept-encoding because cloudflare has problems with it
    if (proxyHeaders['accept-encoding']?.includes('br'))
      proxyHeaders['accept-encoding'] = proxyHeaders[
        'accept-encoding'
      ]?.replace('br', '');
  }
  const baseHeaders: any = {
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
  headers = {
    ...baseHeaders,
    ...headers,
    ...forwardHeadersMap,
    ...(fn === 'proxy' && proxyHeaders),
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(fn === 'uploadFile' && { duplex: 'half' }),
  };
  const contentType = headers['content-type']?.split(';')[0];
  const isGetMethod = method === 'GET';
  const isMultipartFormData = contentType === CONTENT_TYPES.MULTIPART_FORM_DATA;
  const shouldDeleteContentTypeHeader =
    (isGetMethod || isMultipartFormData) && fetchOptions.headers;

  if (shouldDeleteContentTypeHeader) {
    const headers = fetchOptions.headers as Record<string, unknown>;
    delete headers['content-type'];
    if (fn === 'uploadFile') {
      headers['Content-Type'] = requestHeaders['content-type'];
      headers[`x-${POWERED_BY}-file-purpose`] =
        requestHeaders[`x-${POWERED_BY}-file-purpose`];
    }
  }

  return fetchOptions;
}

function getProxyPath(
  requestURL: string,
  proxyProvider: string,
  proxyEndpointPath: string,
  baseURL: string,
  providerOptions: Options,
  requestHeaders: Record<string, string>
) {
  let reqURL = new URL(requestURL);
  let reqPath = reqURL.pathname;
  const reqQuery = reqURL.search;
  reqPath = reqPath.replace(proxyEndpointPath, '');

  // NOTE: temporary support for the deprecated way of making azure requests
  // where the endpoint was sent in request path of the incoming gateway url
  if (
    proxyProvider === AZURE_OPEN_AI &&
    reqPath.includes('.openai.azure.com')
  ) {
    return `https:/${reqPath}${reqQuery}`;
  }

  if (Providers[proxyProvider]?.api?.getProxyEndpoint) {
    return `${baseURL}${Providers[proxyProvider].api.getProxyEndpoint({ reqPath, reqQuery, providerOptions, requestHeaders })}`;
  }

  let proxyPath = `${baseURL}${reqPath}${reqQuery}`;

  // Fix specific for Anthropic SDK calls. Is this needed? - Yes
  if (proxyProvider === ANTHROPIC) {
    proxyPath = proxyPath.replace('/v1/v1/', '/v1/');
  }

  return proxyPath;
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
  const totalWeight = providers.reduce(
    (sum: number, provider: any) => sum + provider.weight,
    0
  );

  // Select a random weight between 0 and totalWeight
  let randomWeight = Math.random() * totalWeight;

  // Find the provider that corresponds to the selected weight
  for (const [index, provider] of providers.entries()) {
    // @ts-ignore since weight is being default set above
    if (randomWeight < provider.weight) {
      return { ...provider, index };
    }
    // @ts-ignore since weight is being default set above
    randomWeight -= provider.weight;
  }

  throw new Error('No provider selected, please check the weights');
}

export function convertHooksShorthand(
  hooksArr: any,
  type: string,
  hookType: HookType
) {
  return hooksArr.map((hook: any) => {
    let hooksObject: any = {
      type: hookType,
      id: `${type}_guardrail_${Math.random().toString(36).substring(2, 5)}`,
    };

    // if the deny key is present (true or false), add it to hooksObject and remove it from guardrails
    [
      'deny',
      'on_fail',
      'on_success',
      'async',
      'id',
      'type',
      'guardrail_version_id',
      'sequential',
    ].forEach((key) => {
      if (hook.hasOwnProperty(key)) {
        hooksObject[key] = hook[key];
        delete hook[key];
      }
    });

    hooksObject = convertKeysToCamelCase(hooksObject);

    // Now, add all the checks to the checks array
    hooksObject.checks = Object.keys(hook).map((key) => {
      const id = hook[key].id;
      return {
        id: id.includes('.') ? id : `default.${id}`,
        parameters: hook[key],
        is_enabled: hook[key].is_enabled,
      };
    });

    return hooksObject;
  });
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
  requestBody: Params | FormData | ArrayBuffer | ReadableStream,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  currentIndex: number | string,
  method: string = 'POST'
): Promise<Response> {
  const targetProcessingStartTime = Date.now();
  const overrideParams = providerOption?.overrideParams || {};
  let params: Params =
    requestBody instanceof ReadableStream || requestBody instanceof FormData
      ? {}
      : { ...requestBody, ...overrideParams };
  const isStreamingMode =
    (fn === 'imageEdit' || fn === 'createTranscription') &&
    requestBody instanceof FormData
      ? requestBody.get('stream') === 'true'
      : params.stream
        ? true
        : false;
  let strictOpenAiCompliance = true;

  if (requestHeaders[HEADER_KEYS.STRICT_OPEN_AI_COMPLIANCE] === 'false') {
    strictOpenAiCompliance = false;
  } else if (providerOption.strictOpenAiCompliance === false) {
    strictOpenAiCompliance = false;
  }

  let metadata: Record<string, string> = {};
  try {
    metadata = JSON.parse(requestHeaders[HEADER_KEYS.METADATA]);
  } catch {
    metadata = {};
  }

  const provider: string = providerOption.provider ?? '';

  // --- Messages/Responses API Adapter ---
  // Per-provider decision: adapt to chatComplete format if the provider
  // doesn't natively support the requested API.
  const adapterResult = applyAdapterRequestTransform(
    fn,
    provider,
    params,
    requestBody,
    isStreamingMode,
    method
  );
  if (adapterResult instanceof Response) return adapterResult;

  let adapterCtx: AdapterContext = {
    isActive: false,
    originalFn: fn,
    originalRequest: null,
    provider,
  };
  if (adapterResult) {
    ({ params, requestBody, fn } = adapterResult);
    adapterCtx = adapterResult.adapterCtx;
    strictOpenAiCompliance = false;
  }

  const hooksManager = c.get('hooksManager');
  const hookSpan = hooksManager.createSpan(
    params,
    metadata,
    provider,
    isStreamingMode,
    [
      ...(providerOption.beforeRequestHooks || []),
      ...(providerOption.defaultInputGuardrails || []),
    ],
    [
      ...(providerOption.afterRequestHooks || []),
      ...(providerOption.defaultOutputGuardrails || []),
    ],
    null,
    fn,
    requestHeaders
  );

  // Mapping providers to corresponding URLs
  const providerConfig = Providers[provider];
  const apiConfig: ProviderAPIConfig = providerConfig.api;

  let brhResponse: Response | undefined;
  let transformedBody: any;
  let createdAt: Date;

  let url: string;
  const forwardHeaders =
    requestHeaders[HEADER_KEYS.FORWARD_HEADERS]
      ?.split(',')
      .map((h) => h.trim()) ||
    providerOption.forwardHeaders ||
    [];

  const customHost =
    requestHeaders[HEADER_KEYS.CUSTOM_HOST] || providerOption.customHost || '';
  const baseUrl =
    customHost ||
    (await apiConfig.getBaseURL({
      providerOptions: providerOption,
      fn,
      c,
      gatewayRequestURL: c.req.url,
      params: params,
    }));
  const endpoint =
    fn === 'proxy'
      ? ''
      : apiConfig.getEndpoint({
          c,
          providerOptions: providerOption,
          fn,
          gatewayRequestBodyJSON: params,
          gatewayRequestBody: {}, // not using anywhere.
          gatewayRequestURL: c.req.url,
        });

  url =
    fn === 'proxy'
      ? getProxyPath(
          c.req.url,
          provider,
          c.req.url.indexOf('/v1/proxy') > -1 ? '/v1/proxy' : '/v1',
          baseUrl,
          providerOption,
          requestHeaders
        )
      : `${baseUrl}${endpoint}`;

  let mappedResponse: Response;
  let retryCount: number | undefined;
  let originalResponseJson: Record<string, any> | null | undefined;
  let executionTime: number = 0;
  let responseParsingTime: number = 0;
  let preRequestValidatorExecutionTime: number = 0;
  let brhExecutionTime: number = 0;
  let arhExecutionTime: number = 0;
  let cacheExecutionTime: number = 0;

  let cacheKey: string | undefined;
  let { cacheMode, cacheMaxAge, cacheStatus } = getCacheOptions(
    providerOption.cache
  );
  let cacheResponse: Response | undefined;

  const requestOptions = c.get('requestOptions') ?? [];
  let transformedRequestBody: ReadableStream | FormData | Params = {};
  let fetchOptions: RequestInit = {};
  const areSyncHooksAvailable = Boolean(
    hooksManager.getHooksToExecute(hookSpan, [
      'syncBeforeRequestHook',
      'syncAfterRequestHook',
    ]).length
  );

  // before_request_hooks handler
  ({
    response: brhResponse,
    createdAt,
    transformedBody,
    executionTime: brhExecutionTime,
  } = await beforeRequestHookHandler(c, hookSpan.id));

  if (brhResponse) {
    // transformedRequestBody is required to be set in requestOptions.
    // So in case the before request hooks fail (with deny as true), we need to set it here.
    // If the hooks do not result in a 446 response, transformedRequestBody is determined on the updated HookSpan context.
    if (!providerConfig?.requestHandlers?.[fn]) {
      transformedRequestBody =
        method === 'POST'
          ? transformToProviderRequest(
              provider,
              params,
              requestBody,
              fn,
              requestHeaders,
              providerOption
            )
          : requestBody;
    }
    return createResponse(brhResponse, undefined, false, false);
  }

  if (transformedBody) {
    params = hookSpan.getContext().request.json;
  }

  // Attach the body of the request
  if (!providerConfig?.requestHandlers?.[fn]) {
    transformedRequestBody =
      method === 'POST'
        ? transformToProviderRequest(
            provider,
            params,
            requestBody,
            fn,
            requestHeaders,
            providerOption
          )
        : requestBody;
  }

  let headers: Record<string, string>;
  if (fn === 'proxy') {
    fetchOptions = constructRequest(
      {}, // assume for proxy there are no headers from provider config
      provider,
      method,
      forwardHeaders,
      requestHeaders,
      fn
    );

    headers = await apiConfig.headers({
      c,
      providerOptions: providerOption,
      fn,
      transformedRequestBody,
      transformedRequestUrl: url,
      gatewayRequestBody:
        requestBody instanceof ArrayBuffer ? requestBody : params,
      // calculate signature with cleaned headers.
      headers: fetchOptions.headers as Record<string, string>,
    });
    // update the headers with signature headers.
    const providerHeaders = new Headers(headers);

    const providerAuthorization =
      providerHeaders.get('Authorization') ||
      providerHeaders.get('authorization') ||
      '';

    fetchOptions.headers = {
      ...Object.fromEntries(providerHeaders), // spread constructed headers
      ...fetchOptions.headers, // spread provider specific headers mostly auth headers.
      ...(providerAuthorization && { authorization: providerAuthorization }),
    };
  } else {
    headers = await apiConfig.headers({
      c,
      providerOptions: providerOption,
      fn,
      transformedRequestBody,
      transformedRequestUrl: url,
      gatewayRequestBody: params,
      headers: requestHeaders,
    });

    // Construct the base object for the POST request
    fetchOptions = constructRequest(
      headers,
      provider,
      method,
      forwardHeaders,
      requestHeaders,
      fn
    );
  }

  const headerContentType = headers[HEADER_KEYS.CONTENT_TYPE];
  const requestContentType =
    requestHeaders[HEADER_KEYS.CONTENT_TYPE.toLowerCase()]?.split(';')[0];
  if (
    headerContentType === CONTENT_TYPES.MULTIPART_FORM_DATA ||
    (fn == 'proxy' && requestContentType === CONTENT_TYPES.MULTIPART_FORM_DATA)
  ) {
    fetchOptions.body = transformedRequestBody as FormData;
  } else if (
    transformedRequestBody instanceof ReadableStream ||
    transformedRequestBody instanceof Readable
  ) {
    fetchOptions.body = transformedRequestBody as any;
  } else if (
    fn == 'proxy' &&
    (requestContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN) ||
      requestContentType?.startsWith(CONTENT_TYPES.APPLICATION_OCTET_STREAM))
  ) {
    fetchOptions.body = transformedRequestBody as ArrayBuffer;
  } else if (requestContentType) {
    fetchOptions.body = JSON.stringify(transformedRequestBody);
  }

  if (['GET', 'DELETE'].includes(method)) {
    delete fetchOptions.body;
  }

  const customOptions = apiConfig?.getOptions?.();

  if (customOptions) {
    fetchOptions = {
      ...fetchOptions,
      ...customOptions,
    };
  }

  providerOption.retry = {
    attempts: providerOption.retry?.attempts ?? 0,
    onStatusCodes: providerOption.retry?.attempts
      ? providerOption.retry?.onStatusCodes ?? RETRY_STATUS_CODES
      : [],
    useRetryAfterHeader: providerOption?.retry?.useRetryAfterHeader,
  };

  async function createResponse(
    response: Response,
    responseTransformer: string | undefined,
    isCacheHit: boolean,
    isResponseAlreadyMapped: boolean = false
  ) {
    if (!isResponseAlreadyMapped) {
      ({ response: mappedResponse, originalResponseJson } =
        await responseHandler(
          c,
          response,
          isStreamingMode,
          provider,
          responseTransformer,
          url,
          isCacheHit,
          params,
          strictOpenAiCompliance,
          c.req.url,
          areSyncHooksAvailable,
          hookSpan.id,
          providerOption
        ));
    }

    updateResponseHeaders(
      mappedResponse as Response,
      currentIndex,
      params,
      cacheStatus,
      retryCount ?? 0,
      requestHeaders[HEADER_KEYS.TRACE_ID] ?? '',
      provider
    );

    c.set('requestOptions', [
      ...requestOptions,
      {
        providerOptions: {
          ...providerOption,
          requestURL: url,
          rubeusURL: fn,
        },
        transformedRequest: {
          body: transformedRequestBody,
          headers: fetchOptions.headers,
        },
        requestParams: transformedRequestBody,
        finalUntransformedRequest: {
          body: params,
        },
        originalResponse: {
          body: originalResponseJson,
        },
        createdAt,
        response: mappedResponse,
        cacheStatus: cacheStatus,
        lastUsedOptionIndex: currentIndex,
        cacheKey: cacheKey,
        cacheMode: cacheMode,
        cacheMaxAge: cacheMaxAge,
        hookSpanId: hookSpan.id,
        cacheExecutionTime: cacheExecutionTime || 0,
        executionTime: executionTime || 0,
        responseParsingTime: responseParsingTime || 0,
        targetProcessingTime: Date.now() - targetProcessingStartTime,
        preRequestValidatorExecutionTime: preRequestValidatorExecutionTime || 0,
        brhExecutionTime: brhExecutionTime || 0,
        arhExecutionTime: arhExecutionTime || 0,
      },
    ]);

    return mappedResponse;
  }

  if (!adapterCtx.isActive) {
    // Cache Handler
    ({
      cacheResponse,
      cacheStatus,
      cacheKey,
      createdAt,
      cacheExecutionTime,
      executionTime,
    } = await cacheHandler(
      c,
      providerOption,
      requestHeaders,
      fetchOptions,
      transformedRequestBody,
      hookSpan.id,
      fn,
      url
    ));
    if (cacheResponse) {
      return createResponse(cacheResponse, fn, true);
    }
  }

  // Prerequest validator (For virtual key budgets)
  const preRequestValidator = c.get('preRequestValidator');
  const preRequestValidatorStartTime = Date.now();
  const preRequestValidatorResponse = preRequestValidator
    ? await preRequestValidator(
        c,
        providerOption,
        requestHeaders,
        params,
        metadata
      )
    : undefined;
  preRequestValidatorExecutionTime = Date.now() - preRequestValidatorStartTime;
  if (preRequestValidatorResponse) {
    return createResponse(preRequestValidatorResponse, undefined, false);
  }

  // Request Handler (Including retries, recursion and hooks)
  ({
    mappedResponse,
    retryCount,
    createdAt,
    originalResponseJson,
    executionTime,
    responseParsingTime,
    arhExecutionTime,
  } = await recursiveAfterRequestHookHandler(
    c,
    url,
    fetchOptions,
    providerOption,
    isStreamingMode,
    params,
    0,
    fn,
    requestHeaders,
    hookSpan.id,
    strictOpenAiCompliance,
    requestBody
  ));

  const finalResult = await createResponse(
    mappedResponse,
    undefined,
    false,
    true
  );
  return adaptResponse(finalResult, adapterCtx, c);
}

export async function tryTargetsRecursively(
  c: Context,
  targetGroup: Targets,
  request: Params | FormData | ReadableStream,
  requestHeaders: Record<string, string>,
  fn: endpointStrings,
  method: string,
  jsonPath: string,
  inheritedConfig: Record<string, any> = {}
): Promise<Response> {
  const currentTarget: any = { ...targetGroup };
  let currentJsonPath = jsonPath;
  const strategyMode = currentTarget.strategy?.mode;

  const cEnv = env(c);
  // start: merge inherited config with current target config (preference given to current)
  const currentInheritedConfig: Record<string, any> = {
    id: inheritedConfig.id || currentTarget.id,
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
    defaultInputGuardrails: inheritedConfig.defaultInputGuardrails,
    defaultOutputGuardrails: inheritedConfig.defaultOutputGuardrails,
  };

  // Inherited config can be empty only for the base case of recursive call.
  // To avoid redundant conversion of guardrails to hooks, we do this check.
  if (Object.keys(inheritedConfig).length === 0) {
    if (currentTarget.defaultInputGuardrails) {
      currentInheritedConfig.defaultInputGuardrails = [
        ...convertHooksShorthand(
          currentTarget.defaultInputGuardrails,
          'input',
          HookType.GUARDRAIL
        ),
      ];
    }
    if (currentTarget.defaultOutputGuardrails) {
      currentInheritedConfig.defaultOutputGuardrails = [
        ...convertHooksShorthand(
          currentTarget.defaultOutputGuardrails,
          'output',
          HookType.GUARDRAIL
        ),
      ];
    }
  }

  if (typeof currentTarget.strictOpenAiCompliance === 'boolean') {
    currentInheritedConfig.strictOpenAiCompliance =
      currentTarget.strictOpenAiCompliance;
  } else if (typeof inheritedConfig.strictOpenAiCompliance === 'boolean') {
    currentInheritedConfig.strictOpenAiCompliance =
      inheritedConfig.strictOpenAiCompliance;
  }

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

  if (currentTarget.inputGuardrails) {
    currentTarget.beforeRequestHooks = [
      ...(currentTarget.beforeRequestHooks || []),
      ...convertHooksShorthand(
        currentTarget.inputGuardrails,
        'input',
        HookType.GUARDRAIL
      ),
    ];
  }

  if (currentTarget.outputGuardrails) {
    currentTarget.afterRequestHooks = [
      ...(currentTarget.afterRequestHooks || []),
      ...convertHooksShorthand(
        currentTarget.outputGuardrails,
        'output',
        HookType.GUARDRAIL
      ),
    ];
  }

  if (currentTarget.inputMutators) {
    currentTarget.beforeRequestHooks = [
      ...(currentTarget.beforeRequestHooks || []),
      ...convertHooksShorthand(
        currentTarget.inputMutators,
        'input',
        HookType.MUTATOR
      ),
    ];
  }

  if (currentTarget.outputMutators) {
    currentTarget.afterRequestHooks = [
      ...(currentTarget.afterRequestHooks || []),
      ...convertHooksShorthand(
        currentTarget.outputMutators,
        'output',
        HookType.MUTATOR
      ),
    ];
  }

  if (currentTarget.afterRequestHooks) {
    currentInheritedConfig.afterRequestHooks = [
      ...currentTarget.afterRequestHooks,
    ];
  } else if (inheritedConfig.afterRequestHooks) {
    currentInheritedConfig.afterRequestHooks = [
      ...inheritedConfig.afterRequestHooks,
    ];
    currentTarget.afterRequestHooks = [...inheritedConfig.afterRequestHooks];
  }

  if (currentTarget.beforeRequestHooks) {
    currentInheritedConfig.beforeRequestHooks = [
      ...currentTarget.beforeRequestHooks,
    ];
  } else if (inheritedConfig.beforeRequestHooks) {
    currentInheritedConfig.beforeRequestHooks = [
      ...inheritedConfig.beforeRequestHooks,
    ];
    currentTarget.beforeRequestHooks = [...inheritedConfig.beforeRequestHooks];
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

  currentTarget.defaultInputGuardrails = [
    ...currentInheritedConfig.defaultInputGuardrails,
  ];
  currentTarget.defaultOutputGuardrails = [
    ...currentInheritedConfig.defaultOutputGuardrails,
  ];
  // end: merge inherited config with current target config (preference given to current)

  const isHandlingCircuitBreaker = currentInheritedConfig.id;
  if (isHandlingCircuitBreaker) {
    const healthyTargets = (currentTarget.targets || [])
      .map((t: any, index: number) => ({
        ...t,
        originalIndex: index,
      }))
      .filter((t: any) => !t.isOpen);

    if (healthyTargets.length) {
      currentTarget.targets = healthyTargets;
    }
  }

  let response;

  switch (strategyMode) {
    case StrategyModes.FALLBACK:
      for (const [index, target] of currentTarget.targets.entries()) {
        const originalIndex = target.originalIndex || index;
        response = await tryTargetsRecursively(
          c,
          target,
          request,
          requestHeaders,
          fn,
          method,
          `${currentJsonPath}.targets[${originalIndex}]`,
          currentInheritedConfig
        );

        const codes = currentTarget.strategy?.onStatusCodes;
        const gatewayException =
          response?.headers.get('x-portkey-gateway-exception') === 'true';
        if (
          // If onStatusCodes is provided, and the response status is not in the list
          (Array.isArray(codes) && !codes.includes(response?.status)) ||
          // If onStatusCodes is not provided, and the response is ok
          (!codes && response?.ok) ||
          // If the response is a gateway exception
          gatewayException
        ) {
          // Skip the fallback
          break;
        }
      }
      break;

    case StrategyModes.LOADBALANCE: {
      currentTarget.targets.forEach((t: Options) => {
        if (t.weight === undefined) {
          t.weight = 1;
        }
      });
      const totalWeight = currentTarget.targets.reduce(
        (sum: number, provider: any) => sum + provider.weight,
        0
      );

      let selectedIndex: number | null = null;
      const stickyConfig = currentTarget.strategy.sticky;
      let stickyIdentifierHash: string | null = null;

      // Check if sticky sessions are enabled
      if (stickyConfig?.enabled && requestHeaders[HEADER_KEYS.CONFIG_VERSION]) {
        // Build context for hash calculation
        let metadata: Record<string, string>;
        try {
          metadata = JSON.parse(requestHeaders[HEADER_KEYS.METADATA]);
        } catch (err) {
          metadata = {};
        }
        const hashContext = {
          requestHeaders,
          configVersion: requestHeaders[HEADER_KEYS.CONFIG_VERSION],
          metadata,
          env: cEnv,
          params:
            request instanceof FormData ||
            request instanceof ReadableStream ||
            request instanceof ArrayBuffer
              ? undefined
              : (request as Record<string, any>),
        };

        const { targetIndex: cachedIndex, identifierHash } =
          await stickySessionManager.getTargetIndex(
            hashContext,
            stickyConfig.hash_fields
          );
        stickyIdentifierHash = identifierHash;

        // Validate cached index is still valid
        if (
          cachedIndex !== null &&
          cachedIndex >= 0 &&
          cachedIndex < currentTarget.targets.length
        ) {
          selectedIndex = cachedIndex;
        } else if (cachedIndex !== null) {
          // Invalid index, perform new selection
          selectedIndex = null;
        }
      }

      // If no sticky target found, perform weighted random selection
      if (selectedIndex === null) {
        let randomWeight = Math.random() * totalWeight;
        for (const [index, provider] of currentTarget.targets.entries()) {
          if (randomWeight < provider.weight) {
            selectedIndex = index;
            break;
          }
          randomWeight -= provider.weight;
        }

        // Store the selection for sticky sessions if enabled
        if (stickyConfig?.enabled) {
          const ttl = stickyConfig.ttl || 300;
          await stickySessionManager.setTargetIndexByHash(
            requestHeaders[HEADER_KEYS.CONFIG_VERSION],
            stickyIdentifierHash,
            selectedIndex as number,
            ttl,
            cEnv
          );
        }
      }

      const provider = currentTarget.targets[selectedIndex as number];
      const originalIndex = provider.originalIndex || selectedIndex;
      currentJsonPath = currentJsonPath + `.targets[${originalIndex}]`;
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

    case StrategyModes.CONDITIONAL: {
      let metadata: Record<string, string>;
      try {
        metadata = JSON.parse(requestHeaders[HEADER_KEYS.METADATA]);
      } catch (err) {
        metadata = {};
      }

      const params =
        request instanceof FormData ||
        request instanceof ReadableStream ||
        request instanceof ArrayBuffer
          ? {} // Send empty object if not JSON
          : request;

      let conditionalRouter: ConditionalRouter;
      let finalTarget: Targets;
      try {
        conditionalRouter = new ConditionalRouter(currentTarget, {
          metadata,
          params,
          url: { pathname: c.req.path },
        });
        finalTarget = conditionalRouter.resolveTarget();
      } catch (conditionalRouter: any) {
        throw new RouterError(conditionalRouter.message);
      }

      const originalIndex = finalTarget.originalIndex || finalTarget.index;
      response = await tryTargetsRecursively(
        c,
        finalTarget,
        request,
        requestHeaders,
        fn,
        method,
        `${currentJsonPath}.targets[${originalIndex}]`,
        currentInheritedConfig
      );
      break;
    }

    case StrategyModes.SINGLE:
      const originalIndex = currentTarget.targets[0].originalIndex || 0;
      response = await tryTargetsRecursively(
        c,
        currentTarget.targets[0],
        request,
        requestHeaders,
        fn,
        method,
        `${currentJsonPath}.targets[${originalIndex}]`,
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
          currentJsonPath,
          method
        );
        if (isHandlingCircuitBreaker) {
          await c.get('handleCircuitBreakerResponse')?.(
            response,
            currentInheritedConfig.id,
            currentTarget.cbConfig,
            currentJsonPath,
            c
          );
        }
      } catch (error: any) {
        // tryPost always returns a Response.
        const errorMessage =
          error instanceof GatewayError
            ? error.message
            : 'Something went wrong';
        logger.error(`Something went wrong:`, error);
        response = new Response(
          JSON.stringify({
            status: 'failure',
            message: errorMessage,
          }),
          {
            status: error instanceof GatewayError ? error.status : 500,
            headers: {
              'content-type': 'application/json',
              // Add this header so that the fallback loop can be interrupted if its an exception.
              'x-portkey-gateway-exception': 'true',
            },
          }
        );
      }
      break;
  }

  return response!;
}

/**
 * Updates the response headers with the provided values.
 * @param {Response} response - The response object.
 * @param {string | number} currentIndex - The current index value.
 * @param {Record<string, any>} params - The parameters object.
 * @param {string} cacheStatus - The cache status value.
 * @param {number} retryAttempt - The retry attempt count.
 * @param {string} traceId - The trace ID value.
 */
export function updateResponseHeaders(
  response: Response,
  currentIndex: string | number,
  params: Record<string, any>,
  cacheStatus: string | undefined,
  retryAttempt: number,
  traceId: string,
  provider: string
) {
  response.headers.append(
    RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX,
    currentIndex.toString()
  );

  if (cacheStatus) {
    response.headers.append(RESPONSE_HEADER_KEYS.CACHE_STATUS, cacheStatus);
  }
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
  if (getRuntimeKey() == 'node') {
    response.headers.delete('content-encoding');
  }

  // Delete content-length header to avoid conflicts with hono compress middleware
  // workerd environment handles this authomatically
  response.headers.delete('content-length');
  response.headers.delete('transfer-encoding');
  if (provider && provider !== POWERED_BY) {
    response.headers.append(HEADER_KEYS.PROVIDER, provider);
  }
}

export async function recursiveAfterRequestHookHandler(
  c: Context,
  url: any,
  options: any,
  providerOption: Options,
  isStreamingMode: any,
  gatewayParams: any,
  retryAttemptsMade: any,
  fn: endpointStrings,
  requestHeaders: Record<string, string>,
  hookSpanId: string,
  strictOpenAiCompliance: boolean,
  requestBody?: ReadableStream | FormData | Params | ArrayBuffer
): Promise<{
  mappedResponse: Response;
  retryCount: number;
  createdAt: Date;
  executionTime: number;
  originalResponseJson?: Record<string, any> | null;
  responseParsingTime: number;
  arhExecutionTime: number;
}> {
  let response, retryCount, createdAt, executionTime, retrySkipped;
  const requestTimeout =
    Number(requestHeaders[HEADER_KEYS.REQUEST_TIMEOUT]) ||
    providerOption.requestTimeout ||
    null;

  const { retry } = providerOption;

  const provider = providerOption.provider ?? '';
  const providerConfig = Providers[provider];
  const requestHandlers = providerConfig.requestHandlers;
  let requestHandler;
  if (requestHandlers && requestHandlers[fn]) {
    requestHandler = () =>
      requestHandlers[fn]!({
        c,
        providerOptions: providerOption,
        requestURL: c.req.url,
        requestHeaders,
        requestBody,
      });
  }

  ({
    response,
    attempt: retryCount,
    createdAt,
    executionTime,
    skip: retrySkipped,
  } = await retryRequest(
    url,
    options,
    retry?.attempts || 0,
    retry?.onStatusCodes || [],
    requestTimeout || null,
    requestHandler,
    retry?.useRetryAfterHeader || false
  ));
  c.set(
    METRICS_KEYS.LLM_LATENCY,
    executionTime + c.get(METRICS_KEYS.LLM_LATENCY)
  );

  const hooksManager = c.get('hooksManager') as HooksManager;
  const hookSpan = hooksManager.getSpan(hookSpanId) as HookSpan;
  // Check if sync hooks are available
  // This will be used to determine if we need to parse the response body or simply passthrough the response as is
  const areSyncHooksAvailable = Boolean(
    hooksManager.getHooksToExecute(hookSpan, [
      'syncBeforeRequestHook',
      'syncAfterRequestHook',
    ]).length
  );

  const {
    response: mappedResponse,
    responseJson: mappedResponseJson,
    originalResponseJson,
    timeToLastByte,
  } = await responseHandler(
    c,
    response,
    isStreamingMode,
    providerOption,
    fn,
    url,
    false,
    gatewayParams,
    strictOpenAiCompliance,
    c.req.url,
    areSyncHooksAvailable,
    hookSpanId,
    providerOption
  );
  c.set(
    METRICS_KEYS.LLM_LAST_BYTE_DIFF_LATENCY,
    (timeToLastByte || 0) + c.get(METRICS_KEYS.LLM_LAST_BYTE_DIFF_LATENCY)
  );
  const arhStartTime = Date.now();
  const arhResponse = await afterRequestHookHandler(
    c,
    mappedResponse,
    mappedResponseJson,
    hookSpanId,
    retryAttemptsMade
  );
  const arhExecutionTime = Date.now() - arhStartTime;

  const remainingRetryCount =
    (retry?.attempts || 0) - (retryCount || 0) - retryAttemptsMade;

  const isRetriableStatusCode = retry?.onStatusCodes?.includes(
    arhResponse.status
  );

  if (remainingRetryCount > 0 && !retrySkipped && isRetriableStatusCode) {
    return recursiveAfterRequestHookHandler(
      c,
      url,
      options,
      providerOption,
      isStreamingMode,
      gatewayParams,
      (retryCount || 0) + 1 + retryAttemptsMade,
      fn,
      requestHeaders,
      hookSpanId,
      strictOpenAiCompliance
    );
  }

  let lastAttempt = (retryCount || 0) + retryAttemptsMade;
  if (
    (lastAttempt === (retry?.attempts || 0) && isRetriableStatusCode) ||
    retrySkipped
  ) {
    lastAttempt = -1; // All retry attempts exhausted without success.
  }

  return {
    mappedResponse: arhResponse,
    retryCount: lastAttempt,
    createdAt,
    executionTime,
    arhExecutionTime: arhExecutionTime ?? 0,
    originalResponseJson,
    responseParsingTime: timeToLastByte ?? 0,
  };
}

/**
 * Retrieves the cache options based on the provided cache configuration.
 * @param cacheConfig - The cache configuration object or string.
 * @returns An object containing the cache mode and cache max age.
 */
function getCacheOptions(cacheConfig: any) {
  // providerOption.cache needs to be sent here
  let cacheMode: string | undefined;
  let cacheMaxAge: string | number = '';
  let cacheStatus = 'DISABLED';

  if (typeof cacheConfig === 'object' && cacheConfig?.mode) {
    cacheMode = cacheConfig.mode;
    cacheMaxAge = cacheConfig.maxAge;
  } else if (typeof cacheConfig === 'string') {
    cacheMode = cacheConfig;
  }
  return { cacheMode, cacheMaxAge, cacheStatus };
}

async function cacheHandler(
  c: Context,
  providerOption: Options,
  requestHeaders: Record<string, string>,
  fetchOptions: any,
  transformedRequestBody: any,
  hookSpanId: string,
  fn: endpointStrings,
  url: string
) {
  if (
    [
      'uploadFile',
      'listFiles',
      'retrieveFile',
      'deleteFile',
      'retrieveFileContent',
      'createBatch',
      'retrieveBatch',
      'cancelBatch',
      'listBatches',
      'getBatchOutput',
      'listFinetunes',
      'createFinetune',
      'retrieveFinetune',
      'cancelFinetune',
      'imageEdit',
    ].includes(fn)
  ) {
    return {
      cacheResponse: undefined,
      cacheStatus: 'DISABLED',
      cacheKey: undefined,
      createdAt: new Date(),
      cacheExecutionTime: 0,
      executionTime: 0,
    };
  }
  const start = Date.now();
  c.set(METRICS_KEYS.LLM_CACHE_GET_START, start);
  const [getFromCacheFunction, cacheIdentifier] = [
    c.get('getFromCache'),
    c.get('cacheIdentifier'),
  ];

  let cacheResponse, cacheKey;
  let cacheMode: string | undefined,
    cacheMaxAge: string | number | undefined,
    cacheStatus: string;
  ({ cacheMode, cacheMaxAge, cacheStatus } = getCacheOptions(
    providerOption.cache
  ));

  if (getFromCacheFunction && cacheMode) {
    [cacheResponse, cacheStatus, cacheKey] = await getFromCacheFunction(
      env(c),
      c,
      { ...requestHeaders, ...fetchOptions.headers },
      transformedRequestBody,
      url,
      cacheIdentifier,
      cacheMode,
      cacheMaxAge
    );
  }

  const hooksManager = c.get('hooksManager') as HooksManager;
  const span = hooksManager.getSpan(hookSpanId) as HookSpan;
  const results = span.getHooksResult();
  const failedBeforeRequestHooks = results.beforeRequestHooksResult?.filter(
    (h) => !h.verdict
  );

  let responseBody = cacheResponse;

  const hasHookResults = results.beforeRequestHooksResult?.length > 0;
  const responseStatus = failedBeforeRequestHooks.length ? 246 : 200;

  if (hasHookResults && cacheResponse) {
    responseBody = JSON.stringify({
      ...JSON.parse(cacheResponse),
      hook_results: {
        before_request_hooks: results.beforeRequestHooksResult,
      },
    });
  }
  const end = Date.now();
  c.set(METRICS_KEYS.LLM_CACHE_GET_END, end);
  const cacheExecutionTime = end - start;
  return {
    cacheResponse: cacheResponse
      ? new Response(responseBody, {
          headers: { 'content-type': 'application/json' },
          status: responseStatus,
        })
      : undefined,
    cacheStatus,
    cacheKey,
    createdAt: new Date(start),
    cacheExecutionTime,
    executionTime: cacheExecutionTime,
  };
}

export async function beforeRequestHookHandler(
  c: Context,
  hookSpanId: string
): Promise<any> {
  let span: HookSpan;
  let isTransformed = false;
  let executionTime = 0;
  try {
    const start = Date.now();
    const hooksManager = c.get('hooksManager');
    const hooksResult = await hooksManager.executeHooks(
      hookSpanId,
      ['syncBeforeRequestHook'],
      {
        env: env(c),
        getFromCacheByKey: c.get('getFromCacheByKey'),
        putInCacheWithValue: c.get('putInCacheWithValue'),
        internalServiceFetch: internalServiceFetch,
        externalServiceFetch: externalServiceFetch,
      }
    );
    const end = Date.now();
    executionTime = end - start;
    span = hooksManager.getSpan(hookSpanId) as HookSpan;
    isTransformed = span.getContext().request.isTransformed;

    if (hooksResult.shouldDeny) {
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message:
                'The guardrail checks defined in the config failed. You can find more information in the `hook_results` object.',
              type: 'hooks_failed',
              param: null,
              code: null,
            },
            hook_results: {
              before_request_hooks: hooksResult.results,
              after_request_hooks: [],
            },
          }),
          {
            status: 446,
            headers: { 'content-type': 'application/json' },
          }
        ),
        createdAt: new Date(start),
        executionTime,
        transformedBody: isTransformed ? span.getContext().request.json : null,
      };
    }
  } catch (err) {
    console.log(err);
    return { error: err, executionTime: 0 };
  }
  return {
    transformedBody: isTransformed ? span.getContext().request.json : null,
    executionTime: executionTime ?? 0,
  };
}
