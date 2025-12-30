import { Context } from 'hono';
import {
  AZURE_OPEN_AI,
  BEDROCK,
  WORKERS_AI,
  HEADER_KEYS,
  POWERED_BY,
  GOOGLE_VERTEX_AI,
  OPEN_AI,
  AZURE_AI_INFERENCE,
  ANTHROPIC,
  CONTENT_TYPES,
  HUGGING_FACE,
  STABILITY_AI,
  SAGEMAKER,
  FIREWORKS_AI,
  CORTEX,
  ORACLE,
} from '../globals';
import { endpointStrings } from '../providers/types';
import { Options, Params, StrategyModes, Targets } from '../types/requestBody';
import { convertKeysToCamelCase } from '../utils';
import { retryRequest } from './retryHandler';
import { env } from 'hono/adapter';
import { afterRequestHookHandler, responseHandler } from './responseHandlers';
import { HookSpan } from '../middlewares/hooks';
import { ConditionalRouter } from '../services/conditionalRouter';
import { RouterError } from '../errors/RouterError';
import { GatewayError } from '../errors/GatewayError';
import { HookType } from '../middlewares/hooks/types';

// Services
import { CacheResponseObject, CacheService } from './services/cacheService';
import { HooksService } from './services/hooksService';
import { LogObjectBuilder, LogsService } from './services/logsService';
import { PreRequestValidatorService } from './services/preRequestValidatorService';
import { ProviderContext } from './services/providerContext';
import { RequestContext } from './services/requestContext';
import { ResponseService } from './services/responseService';

function constructRequestBody(
  requestContext: RequestContext,
  providerHeaders: Record<string, string>
): BodyInit | null {
  const headerContentType = providerHeaders[HEADER_KEYS.CONTENT_TYPE];
  const requestContentType = requestContext.getHeader(HEADER_KEYS.CONTENT_TYPE);

  let body: BodyInit | null = null;

  const isMultiPartRequest =
    headerContentType === CONTENT_TYPES.MULTIPART_FORM_DATA ||
    (requestContext.endpoint == 'proxy' &&
      requestContentType === CONTENT_TYPES.MULTIPART_FORM_DATA);

  const isProxyAudio =
    requestContext.endpoint == 'proxy' &&
    requestContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN);

  const reqBody = requestContext.transformedRequestBody;

  if (isMultiPartRequest) {
    body = reqBody as FormData;
  } else if (requestContext.requestBody instanceof ReadableStream) {
    body = requestContext.requestBody;
  } else if (isProxyAudio) {
    body = reqBody as ArrayBuffer;
  } else if (requestContentType) {
    body = JSON.stringify(reqBody);
  }

  if (['GET', 'DELETE'].includes(requestContext.method)) {
    body = null;
  }

  return body;
}

function constructRequestHeaders(
  requestContext: RequestContext,
  providerConfigMappedHeaders: any
): Record<string, string> {
  const {
    method,
    forwardHeaders,
    requestHeaders,
    endpoint: fn,
    honoContext: c,
  } = requestContext;

  const proxyHeaders: Record<string, string> = {};
  // Handle proxy headers
  if (fn === 'proxy') {
    const poweredByHeadersPattern = `x-${POWERED_BY}-`;
    const headersToAvoidForCloudflare = ['expect'];
    const headersToIgnore = [
      ...(env(c).CUSTOM_HEADERS_TO_IGNORE ?? []),
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
    // if (proxyHeaders['accept-encoding']?.includes('br'))
    //   proxyHeaders['accept-encoding'] = proxyHeaders[
    //     'accept-encoding'
    //   ]?.replace('br', '');
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

  const contentType = headers['content-type']?.split(';')[0];
  const isGetMethod = method === 'GET';
  const isMultipartFormData = contentType === CONTENT_TYPES.MULTIPART_FORM_DATA;
  const shouldDeleteContentTypeHeader =
    (isGetMethod || isMultipartFormData) && headers;

  if (shouldDeleteContentTypeHeader) {
    delete headers['content-type'];
    if (fn === 'uploadFile') {
      headers['Content-Type'] = requestHeaders['content-type'];
      if (requestHeaders[`x-${POWERED_BY}-file-purpose`]) {
        headers[`x-${POWERED_BY}-file-purpose`] =
          requestHeaders[`x-${POWERED_BY}-file-purpose`];
      }
    }
  }

  return headers;
}

/**
 * Constructs the request options for the API call.
 *
 * @param {any} headers - The headers to add in the request.
 * @param {string} provider - The provider for the request.
 * @param {string} method - The HTTP method for the request.
 * @returns {RequestInit} - The fetch options for the request.
 */
export async function constructRequest(
  providerContext: ProviderContext,
  requestContext: RequestContext
): Promise<RequestInit> {
  const providerMappedHeaders =
    await providerContext.getHeaders(requestContext);

  const headers = constructRequestHeaders(
    requestContext,
    providerMappedHeaders
  );

  const fetchOptions: RequestInit = {
    method: requestContext.method,
    headers,
    ...(requestContext.endpoint === 'uploadFile' && { duplex: 'half' }),
  };

  const body = constructRequestBody(requestContext, providerMappedHeaders);
  if (body) {
    fetchOptions.body = body;
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
      const id = hook[key].id ?? key;
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
  const requestContext = new RequestContext(
    c,
    providerOption,
    fn,
    requestHeaders,
    requestBody,
    method,
    currentIndex as number
  );
  const hooksService = new HooksService(requestContext);
  const providerContext = new ProviderContext(requestContext.provider);
  const logsService = new LogsService(c);
  const responseService = new ResponseService(requestContext, hooksService);
  const hookSpan: HookSpan = hooksService.hookSpan;

  // Set the requestURL in requestContext
  requestContext.requestURL = await providerContext.getFullURL(requestContext);

  // Create the base log object from requestContext
  const logObject = new LogObjectBuilder(logsService, requestContext);
  logObject.addHookSpanId(hookSpan.id);

  // before_request_hooks handler
  const {
    response: brhResponse,
    createdAt: brhCreatedAt,
    transformedBody,
  } = await beforeRequestHookHandler(c, hookSpan.id);
  if (brhResponse) {
    // transformedRequestBody is required to be set in requestOptions.
    // So in case the before request hooks fail (with deny as true), we need to set it here.
    // If the hooks do not result in a 446 response, transformedRequestBody is determined on the updated HookSpan context.
    if (!providerContext.hasRequestHandler(requestContext)) {
      requestContext.transformToProviderRequestAndSave();
    }

    const { response, originalResponseJson } = await responseService.create({
      response: brhResponse,
      responseTransformer: undefined,
      isResponseAlreadyMapped: false,
      cache: {
        isCacheHit: false,
        cacheStatus: undefined,
        cacheKey: undefined,
      },
      retryAttempt: 0,
      createdAt: brhCreatedAt,
    });

    logObject
      .updateRequestContext(requestContext)
      .addResponse(response, originalResponseJson)
      .addCache()
      .log();

    return response;
  }

  // If before request hook transformed the body, update the request context
  if (transformedBody) {
    requestContext.params = hookSpan.getContext().request.json;
  }

  // Attach the body of the request
  if (!providerContext.hasRequestHandler(requestContext)) {
    requestContext.transformToProviderRequestAndSave();
  }

  // Construct the base object for the request
  const fetchOptions: RequestInit = await constructRequest(
    providerContext,
    requestContext
  );

  // Cache Handler
  const cacheService = new CacheService(c, hooksService);
  const cacheResponseObject: CacheResponseObject =
    await cacheService.getCachedResponse(
      requestContext,
      fetchOptions.headers || {}
    );
  logObject.addCache(
    cacheResponseObject.cacheStatus,
    cacheResponseObject.cacheKey
  );
  if (cacheResponseObject.cacheResponse) {
    const { response, originalResponseJson } = await responseService.create({
      response: cacheResponseObject.cacheResponse,
      responseTransformer: requestContext.endpoint,
      cache: {
        isCacheHit: true,
        cacheStatus: cacheResponseObject.cacheStatus,
        cacheKey: cacheResponseObject.cacheKey,
      },
      isResponseAlreadyMapped: false,
      retryAttempt: 0,
      fetchOptions,
      createdAt: cacheResponseObject.createdAt,
      executionTime: 0,
    });

    logObject
      .updateRequestContext(requestContext, fetchOptions.headers)
      .addResponse(response, originalResponseJson)
      .log();

    return response;
  }

  // Prerequest validator (For virtual key budgets)
  const preRequestValidatorService = new PreRequestValidatorService(
    c,
    requestContext
  );
  const { response: preRequestValidatorResponse, modelPricingConfig } =
    await preRequestValidatorService.getResponse();

  if (modelPricingConfig) {
    requestContext.updateModelPricingConfig(modelPricingConfig);
  }
  if (preRequestValidatorResponse) {
    const { response, originalResponseJson } = await responseService.create({
      response: preRequestValidatorResponse,
      responseTransformer: undefined,
      isResponseAlreadyMapped: false,
      cache: {
        isCacheHit: false,
        cacheStatus: cacheResponseObject.cacheStatus,
        cacheKey: cacheResponseObject.cacheKey,
      },
      retryAttempt: 0,
      fetchOptions,
      createdAt: new Date(),
    });

    logObject
      .updateRequestContext(requestContext, fetchOptions.headers)
      .addResponse(response, originalResponseJson)
      .log();

    return response;
  }

  // Request Handler (Including retries, recursion and hooks)
  const { mappedResponse, retryCount, createdAt, originalResponseJson } =
    await recursiveAfterRequestHookHandler(
      requestContext,
      fetchOptions,
      0,
      hookSpan.id,
      providerContext,
      hooksService,
      logObject
    );

  const { response, originalResponseJson: mappedOriginalResponseJson } =
    await responseService.create({
      response: mappedResponse,
      responseTransformer: undefined,
      isResponseAlreadyMapped: true,
      cache: {
        isCacheHit: false,
        cacheStatus: cacheResponseObject.cacheStatus,
        cacheKey: cacheResponseObject.cacheKey,
      },
      retryAttempt: retryCount,
      fetchOptions,
      createdAt,
      originalResponseJson,
    });

  logObject
    .updateRequestContext(requestContext, fetchOptions.headers)
    .addResponse(response, mappedOriginalResponseJson)
    .log();

  return response;
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

    case StrategyModes.LOADBALANCE:
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
      for (const [index, provider] of currentTarget.targets.entries()) {
        const originalIndex = provider.originalIndex || index;
        if (randomWeight < provider.weight) {
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
        randomWeight -= provider.weight;
      }
      break;

    case StrategyModes.CONDITIONAL: {
      let metadata: Record<string, string>;
      try {
        metadata = JSON.parse(requestHeaders[HEADER_KEYS.METADATA]);
      } catch (err) {
        metadata = {};
      }

      let params =
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
        // TypeError will check for all unhandled exceptions.
        // GatewayError will check for all handled exceptions which cannot allow the request to proceed.
        console.error(
          'tryTargetsRecursively error: ',
          error.message,
          error.cause,
          error.stack
        );
        const errorMessage =
          error instanceof GatewayError
            ? error.message
            : 'Something went wrong';
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

export function constructConfigFromRequestHeaders(
  requestHeaders: Record<string, any>
): Options | Targets {
  const azureConfig = {
    resourceName: requestHeaders[`x-${POWERED_BY}-azure-resource-name`],
    deploymentId: requestHeaders[`x-${POWERED_BY}-azure-deployment-id`],
    apiVersion: requestHeaders[`x-${POWERED_BY}-azure-api-version`],
    azureAdToken: requestHeaders[`x-${POWERED_BY}-azure-ad-token`],
    azureAuthMode: requestHeaders[`x-${POWERED_BY}-azure-auth-mode`],
    azureManagedClientId:
      requestHeaders[`x-${POWERED_BY}-azure-managed-client-id`],
    azureWorkloadClientId:
      requestHeaders[`x-${POWERED_BY}-azure-workload-client-id`],
    azureEntraClientId: requestHeaders[`x-${POWERED_BY}-azure-entra-client-id`],
    azureEntraClientSecret:
      requestHeaders[`x-${POWERED_BY}-azure-entra-client-secret`],
    azureEntraTenantId: requestHeaders[`x-${POWERED_BY}-azure-entra-tenant-id`],
    azureModelName: requestHeaders[`x-${POWERED_BY}-azure-model-name`],
    openaiBeta:
      requestHeaders[`x-${POWERED_BY}-openai-beta`] ||
      requestHeaders[`openai-beta`],
  };

  const stabilityAiConfig = {
    stabilityClientId: requestHeaders[`x-${POWERED_BY}-stability-client-id`],
    stabilityClientUserId:
      requestHeaders[`x-${POWERED_BY}-stability-client-user-id`],
    stabilityClientVersion:
      requestHeaders[`x-${POWERED_BY}-stability-client-version`],
  };

  const azureAiInferenceConfig = {
    azureApiVersion: requestHeaders[`x-${POWERED_BY}-azure-api-version`],
    azureEndpointName: requestHeaders[`x-${POWERED_BY}-azure-endpoint-name`],
    azureFoundryUrl: requestHeaders[`x-${POWERED_BY}-azure-foundry-url`],
    azureAdToken: requestHeaders[`x-${POWERED_BY}-azure-ad-token`],
    azureAuthMode: requestHeaders[`x-${POWERED_BY}-azure-auth-mode`],
    azureManagedClientId:
      requestHeaders[`x-${POWERED_BY}-azure-managed-client-id`],
    azureEntraClientId: requestHeaders[`x-${POWERED_BY}-azure-entra-client-id`],
    azureEntraClientSecret:
      requestHeaders[`x-${POWERED_BY}-azure-entra-client-secret`],
    azureEntraTenantId: requestHeaders[`x-${POWERED_BY}-azure-entra-tenant-id`],
    azureEntraScope: requestHeaders[`x-${POWERED_BY}-azure-entra-scope`],
    azureExtraParameters: requestHeaders[`x-${POWERED_BY}-azure-extra-params`],
    anthropicVersion: requestHeaders[`x-${POWERED_BY}-anthropic-version`],
  };

  const awsConfig = {
    awsAccessKeyId: requestHeaders[`x-${POWERED_BY}-aws-access-key-id`],
    awsSecretAccessKey: requestHeaders[`x-${POWERED_BY}-aws-secret-access-key`],
    awsSessionToken: requestHeaders[`x-${POWERED_BY}-aws-session-token`],
    awsRegion: requestHeaders[`x-${POWERED_BY}-aws-region`],
    awsRoleArn: requestHeaders[`x-${POWERED_BY}-aws-role-arn`],
    awsAuthType: requestHeaders[`x-${POWERED_BY}-aws-auth-type`],
    awsExternalId: requestHeaders[`x-${POWERED_BY}-aws-external-id`],
    awsS3Bucket: requestHeaders[`x-${POWERED_BY}-aws-s3-bucket`],
    awsS3ObjectKey:
      requestHeaders[`x-${POWERED_BY}-aws-s3-object-key`] ||
      requestHeaders[`x-${POWERED_BY}-provider-file-name`],
    awsBedrockModel:
      requestHeaders[`x-${POWERED_BY}-aws-bedrock-model`] ||
      requestHeaders[`x-${POWERED_BY}-provider-model`],
    awsServerSideEncryption:
      requestHeaders[`x-${POWERED_BY}-amz-server-side-encryption`],
    awsServerSideEncryptionKMSKeyId:
      requestHeaders[
        `x-${POWERED_BY}-amz-server-side-encryption-aws-kms-key-id`
      ],
  };

  const sagemakerConfig = {
    amznSagemakerCustomAttributes:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-custom-attributes`],
    amznSagemakerTargetModel:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-target-model`],
    amznSagemakerTargetVariant:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-target-variant`],
    amznSagemakerTargetContainerHostname:
      requestHeaders[
        `x-${POWERED_BY}-amzn-sagemaker-target-container-hostname`
      ],
    amznSagemakerInferenceId:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-inference-id`],
    amznSagemakerEnableExplanations:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-enable-explanations`],
    amznSagemakerInferenceComponent:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-inference-component`],
    amznSagemakerSessionId:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-session-id`],
    amznSagemakerModelName:
      requestHeaders[`x-${POWERED_BY}-amzn-sagemaker-model-name`],
  };

  const workersAiConfig = {
    workersAiAccountId: requestHeaders[`x-${POWERED_BY}-workers-ai-account-id`],
  };

  const openAiConfig = {
    openaiOrganization: requestHeaders[`x-${POWERED_BY}-openai-organization`],
    openaiProject: requestHeaders[`x-${POWERED_BY}-openai-project`],
    openaiBeta:
      requestHeaders[`x-${POWERED_BY}-openai-beta`] ||
      requestHeaders[`openai-beta`],
  };

  const huggingfaceConfig = {
    huggingfaceBaseUrl: requestHeaders[`x-${POWERED_BY}-huggingface-base-url`],
  };

  const vertexConfig: Record<string, any> = {
    vertexProjectId: requestHeaders[`x-${POWERED_BY}-vertex-project-id`],
    vertexRegion: requestHeaders[`x-${POWERED_BY}-vertex-region`],
    vertexStorageBucketName:
      requestHeaders[`x-${POWERED_BY}-vertex-storage-bucket-name`],
    filename: requestHeaders[`x-${POWERED_BY}-provider-file-name`],
    vertexModelName: requestHeaders[`x-${POWERED_BY}-provider-model`],
    vertexBatchEndpoint:
      requestHeaders[`x-${POWERED_BY}-provider-batch-endpoint`],
    anthropicBeta:
      requestHeaders[`x-${POWERED_BY}-anthropic-beta`] ||
      requestHeaders[`anthropic-beta`],
  };

  const fireworksConfig = {
    fireworksAccountId: requestHeaders[`x-${POWERED_BY}-fireworks-account-id`],
    fireworksFileLength: requestHeaders[`x-${POWERED_BY}-file-upload-size`],
  };

  // we also support the anthropic headers without the x-${POWERED_BY}- prefix for claude code support
  const anthropicConfig = {
    anthropicBeta:
      requestHeaders[`x-${POWERED_BY}-anthropic-beta`] ||
      requestHeaders[`anthropic-beta`],
    anthropicVersion:
      requestHeaders[`x-${POWERED_BY}-anthropic-version`] ||
      requestHeaders[`anthropic-version`],
    anthropicApiKey: requestHeaders[`x-api-key`],
  };

  const vertexServiceAccountJson =
    requestHeaders[`x-${POWERED_BY}-vertex-service-account-json`];

  if (vertexServiceAccountJson) {
    try {
      vertexConfig.vertexServiceAccountJson = JSON.parse(
        vertexServiceAccountJson
      );
    } catch (e) {
      vertexConfig.vertexServiceAccountJson = null;
    }
  }

  const cortexConfig = {
    snowflakeAccount: requestHeaders[`x-${POWERED_BY}-snowflake-account`],
  };

  const oracleConfig = {
    oracleApiVersion: requestHeaders[`x-${POWERED_BY}-oracle-api-version`],
    oracleRegion: requestHeaders[`x-${POWERED_BY}-oracle-region`],
    oracleCompartmentId:
      requestHeaders[`x-${POWERED_BY}-oracle-compartment-id`],
    oracleServingMode: requestHeaders[`x-${POWERED_BY}-oracle-serving-mode`],
    oracleTenancy: requestHeaders[`x-${POWERED_BY}-oracle-tenancy`],
    oracleUser: requestHeaders[`x-${POWERED_BY}-oracle-user`],
    oracleFingerprint: requestHeaders[`x-${POWERED_BY}-oracle-fingerprint`],
    oraclePrivateKey: requestHeaders[`x-${POWERED_BY}-oracle-private-key`],
    oracleKeyPassphrase:
      requestHeaders[`x-${POWERED_BY}-oracle-key-passphrase`],
  };

  const defaultsConfig = {
    input_guardrails: requestHeaders[`x-portkey-default-input-guardrails`]
      ? JSON.parse(requestHeaders[`x-portkey-default-input-guardrails`])
      : [],
    output_guardrails: requestHeaders[`x-portkey-default-output-guardrails`]
      ? JSON.parse(requestHeaders[`x-portkey-default-output-guardrails`])
      : [],
  };

  if (requestHeaders[`x-${POWERED_BY}-config`]) {
    let parsedConfigJson = JSON.parse(requestHeaders[`x-${POWERED_BY}-config`]);
    parsedConfigJson.default_input_guardrails = defaultsConfig.input_guardrails;
    parsedConfigJson.default_output_guardrails =
      defaultsConfig.output_guardrails;

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

      if (
        parsedConfigJson.provider === BEDROCK ||
        parsedConfigJson.provider === SAGEMAKER
      ) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...awsConfig,
        };
      }

      if (parsedConfigJson.provider === SAGEMAKER) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...sagemakerConfig,
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

      if (parsedConfigJson.provider === HUGGING_FACE) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...huggingfaceConfig,
        };
      }

      if (parsedConfigJson.provider === GOOGLE_VERTEX_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...vertexConfig,
        };
      }

      if (parsedConfigJson.provider === FIREWORKS_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...fireworksConfig,
        };
      }

      if (parsedConfigJson.provider === AZURE_AI_INFERENCE) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...azureAiInferenceConfig,
        };
      }
      if (parsedConfigJson.provider === ANTHROPIC) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...anthropicConfig,
        };
      }
      if (parsedConfigJson.provider === STABILITY_AI) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...stabilityAiConfig,
        };
      }

      if (parsedConfigJson.provider === CORTEX) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...cortexConfig,
        };
      }
      if (parsedConfigJson.provider === ORACLE) {
        parsedConfigJson = {
          ...parsedConfigJson,
          ...oracleConfig,
        };
      }
    }
    return convertKeysToCamelCase(parsedConfigJson, [
      'override_params',
      'params',
      'checks',
      'vertex_service_account_json',
      'vertexServiceAccountJson',
      'conditions',
      'input_guardrails',
      'output_guardrails',
      'default_input_guardrails',
      'default_output_guardrails',
      'integrationModelDetails',
      'integrationDetails',
      'virtualKeyDetails',
      'cb_config',
    ]) as any;
  }

  return {
    provider: requestHeaders[`x-${POWERED_BY}-provider`],
    apiKey: requestHeaders['authorization']?.replace('Bearer ', ''),
    defaultInputGuardrails: defaultsConfig.input_guardrails,
    defaultOutputGuardrails: defaultsConfig.output_guardrails,
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === AZURE_OPEN_AI &&
      azureConfig),
    ...([BEDROCK, SAGEMAKER].includes(
      requestHeaders[`x-${POWERED_BY}-provider`]
    ) && awsConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === SAGEMAKER &&
      sagemakerConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === WORKERS_AI &&
      workersAiConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === GOOGLE_VERTEX_AI &&
      vertexConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === AZURE_AI_INFERENCE &&
      azureAiInferenceConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === OPEN_AI && openAiConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === ANTHROPIC &&
      anthropicConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === HUGGING_FACE &&
      huggingfaceConfig),
    mistralFimCompletion:
      requestHeaders[`x-${POWERED_BY}-mistral-fim-completion`],
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === STABILITY_AI &&
      stabilityAiConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === FIREWORKS_AI &&
      fireworksConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === CORTEX && cortexConfig),
    ...(requestHeaders[`x-${POWERED_BY}-provider`] === ORACLE && oracleConfig),
  };
}

export async function recursiveAfterRequestHookHandler(
  requestContext: RequestContext,
  options: any,
  retryAttemptsMade: any,
  hookSpanId: string,
  providerContext: ProviderContext,
  hooksService: HooksService,
  logObject: LogObjectBuilder
): Promise<{
  mappedResponse: Response;
  retryCount: number;
  createdAt: Date;
  originalResponseJson?: Record<string, any> | null;
}> {
  const {
    honoContext: c,
    providerOption,
    isStreaming: isStreamingMode,
    params: gatewayParams,
    endpoint: fn,
    strictOpenAiCompliance,
    requestTimeout,
    retryConfig: retry,
  } = requestContext;

  let response, retryCount, createdAt, retrySkipped;

  const requestHandler = providerContext.getRequestHandler(requestContext);
  const url = requestContext.requestURL;

  ({
    response,
    attempt: retryCount,
    createdAt,
    skip: retrySkipped,
  } = await retryRequest(
    url,
    options,
    retry.attempts,
    retry.onStatusCodes,
    requestTimeout,
    requestHandler,
    retry.useRetryAfterHeader
  ));

  // Check if sync hooks are available
  // This will be used to determine if we need to parse the response body or simply passthrough the response as is
  const areSyncHooksAvailable = hooksService.areSyncHooksAvailable;

  const {
    response: mappedResponse,
    responseJson: mappedResponseJson,
    originalResponseJson,
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
    hookSpanId
  );

  const arhResponse = await afterRequestHookHandler(
    c,
    mappedResponse,
    mappedResponseJson,
    hookSpanId,
    retryAttemptsMade
  );

  const remainingRetryCount =
    (retry?.attempts || 0) - (retryCount || 0) - retryAttemptsMade;

  const isRetriableStatusCode = retry?.onStatusCodes?.includes(
    arhResponse.status
  );

  if (remainingRetryCount > 0 && !retrySkipped && isRetriableStatusCode) {
    // Log the request here since we're about to retry
    logObject
      .updateRequestContext(requestContext, options.headers)
      .addResponse(arhResponse, originalResponseJson)
      .addExecutionTime(createdAt)
      .log();

    return recursiveAfterRequestHookHandler(
      requestContext,
      options,
      (retryCount ?? 0) + 1 + retryAttemptsMade,
      hookSpanId,
      providerContext,
      hooksService,
      logObject
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
    originalResponseJson,
  };
}

export async function beforeRequestHookHandler(
  c: Context,
  hookSpanId: string
): Promise<any> {
  let span: HookSpan;
  let isTransformed = false;
  try {
    const start = new Date();
    const hooksManager = c.get('hooksManager');
    const hooksResult = await hooksManager.executeHooks(
      hookSpanId,
      ['syncBeforeRequestHook'],
      {
        env: env(c),
        getFromCacheByKey: c.get('getFromCacheByKey'),
        putInCacheWithValue: c.get('putInCacheWithValue'),
      }
    );
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
        createdAt: start,
        transformedBody: isTransformed ? span.getContext().request.json : null,
      };
    }
  } catch (err) {
    console.error('beforeRequestHookHandler error: ', err);
    return { error: err };
  }
  return {
    transformedBody: isTransformed ? span.getContext().request.json : null,
  };
}
