import { Context, Env } from 'hono';
import {
  AtomicKeyTypes,
  CACHE_STATUS,
  MODES,
  PORTKEY_HEADER_KEYS,
  RateLimiterKeyTypes,
} from './globals';
import { putInCache } from './handlers/cache';
import { forwardToWinky } from './handlers/logger';
import {
  IntegrationDetails,
  OrganisationDetails,
  VirtualKeyDetails,
  WinkyLogObject,
} from './types';
import {
  AZURE_OPEN_AI,
  BEDROCK,
  GOOGLE,
  GOOGLE_VERTEX_AI,
  HEADER_KEYS,
  ORACLE,
} from '../../globals';
import { env, getRuntimeKey } from 'hono/adapter';
import { preRequestRateLimitValidator } from './handlers/rateLimits';
import { preRequestUsageValidator } from './handlers/usage';
import { Params } from '../../types/requestBody';
import { getContext, ContextKeys } from './contextHelpers';
import { preRequestUsageLimitsPolicyValidator } from './handlers/usageLimitPolicies';
import { preRequestRateLimitPolicyValidator } from './handlers/rateLimitPolicies';
import { logger } from '../../apm';

const runtime = getRuntimeKey();

export const getMappedCacheType = (cacheHeader: string) => {
  if (!cacheHeader) {
    return null;
  }

  if (['simple', 'true'].includes(cacheHeader)) {
    return 'simple';
  }

  if (cacheHeader === 'semantic') {
    return 'semantic';
  }

  return null;
};

export function getPortkeyHeaders(
  headersObj: Record<string, string>
): Record<string, string> {
  const final: Record<string, string> = {};
  const pkHeaderKeys = Object.values(PORTKEY_HEADER_KEYS);
  Object.keys(headersObj).forEach((key: string) => {
    if (pkHeaderKeys.includes(key)) {
      final[key] = headersObj[key];
    }
  });
  delete final[PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS];
  return final;
}

export async function postResponseHandler(
  winkyBaseLog: WinkyLogObject,
  responseBodyJson: Record<string, any>,
  env: Env,
  c: Context
): Promise<void> {
  try {
    const cacheResponseBody = { ...responseBodyJson };
    // Put in Cache if needed
    if (
      responseBodyJson &&
      winkyBaseLog.config.cacheType &&
      winkyBaseLog.cacheKey &&
      [
        CACHE_STATUS.MISS,
        CACHE_STATUS.SEMANTIC_MISS,
        CACHE_STATUS.REFRESH,
      ].includes(winkyBaseLog.config.cacheStatus) &&
      winkyBaseLog.responseStatus === 200 &&
      winkyBaseLog.config.organisationDetails?.id
    ) {
      const cacheKeyUrl = winkyBaseLog.requestURL;

      delete cacheResponseBody.hook_results;
      await putInCache(
        env,
        c,
        {
          ...winkyBaseLog.requestHeaders,
          ...winkyBaseLog.config.portkeyHeaders,
        },
        winkyBaseLog.requestBodyParams,
        cacheResponseBody,
        cacheKeyUrl,
        winkyBaseLog.config.organisationDetails.id,
        winkyBaseLog.config.cacheType,
        winkyBaseLog.config.cacheMaxAge,
        winkyBaseLog.cacheKey
      );
    }
  } catch (err) {
    logger.error('error putting in cache', err);
  }

  // Log this request
  await forwardToWinky(env, winkyBaseLog);
  return;
}

export const getStreamingMode = (
  reqBody: Record<string, any>,
  provider: string,
  requestUrl: string
): boolean => {
  if (
    [GOOGLE, GOOGLE_VERTEX_AI].includes(provider) &&
    requestUrl.indexOf('stream') > -1
  ) {
    return true;
  } else if (
    provider === BEDROCK &&
    (requestUrl.indexOf('invoke-with-response-stream') > -1 ||
      requestUrl.indexOf('converse-stream') > -1)
  ) {
    return true;
  } else if (
    reqBody instanceof FormData &&
    requestUrl.includes('/transcriptions')
  )
    return reqBody.get('stream') === 'true';
  else if (provider === ORACLE && reqBody?.chatRequest?.isStream) {
    return true;
  }
  return !!reqBody?.stream;
};

/**
 * Gets the debug log setting based on request headers and organisation details.
 * Priority is given to x-portkey-debug header if its passed in request.
 * Else default org level setting is considered.
 * @param {Record<string, string>} requestHeaders - The headers from the incoming request.
 * @param {Record<string, any>} organisationDetails - The details of the organisation.
 * @returns {boolean} The debug log setting.
 */
export function getDebugLogSetting(
  requestHeaders: Record<string, string>,
  organisationDetails: Record<string, any>
): boolean {
  const debugSettingHeader =
    requestHeaders[PORTKEY_HEADER_KEYS.DEBUG_LOG_SETTING]?.toLowerCase();

  if (debugSettingHeader === 'false') return false;
  else if (debugSettingHeader === 'true') return true;

  const organisationDebugLogSetting = organisationDetails.settings?.debug_log;

  if (organisationDebugLogSetting === 0) return false;

  return true;
}

export async function preRequestValidator(
  c: Context,
  options: Record<string, any>,
  requestHeaders: Record<string, any>,
  params: Params,
  metadata: Record<string, any>
) {
  //TODO: add workspace metadata validator check
  const organisationDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS)!;

  let integrationDetails: IntegrationDetails | null =
    options.integrationDetails ||
    requestHeaders[PORTKEY_HEADER_KEYS.INTEGRATION_DETAILS];
  let { isIntegrationExhausted } = {
    isIntegrationExhausted: false,
  };
  if (integrationDetails) {
    integrationDetails =
      typeof integrationDetails === 'string'
        ? JSON.parse(integrationDetails)
        : integrationDetails;
    const integrationUsageValidator = await preRequestUsageValidator({
      env: env(c),
      entity: integrationDetails,
      usageLimits: integrationDetails?.usage_limits || [],
      metadata,
      entityType: AtomicKeyTypes.INTEGRATION_WORKSPACE,
      entityKey: `${integrationDetails?.id}-${organisationDetails?.workspaceDetails?.id}`,
      organisationId: organisationDetails.id,
    });
    isIntegrationExhausted = integrationUsageValidator.isExhausted;
  }

  const maxTokens = params.max_tokens || params.max_completion_tokens || 1;
  const { isExhausted: isWorkspaceExhausted, isExpired: isWorkspaceExpired } =
    await preRequestUsageValidator({
      env: env(c),
      entity: organisationDetails.workspaceDetails,
      usageLimits: organisationDetails.workspaceDetails?.usage_limits || [],
      metadata,
      entityType: AtomicKeyTypes.WORKSPACE,
      entityKey: organisationDetails.workspaceDetails.id,
      organisationId: organisationDetails.id,
    });
  const virtualKeyDetails =
    options.virtualKeyDetails ||
    requestHeaders[PORTKEY_HEADER_KEYS.VIRTUAL_KEY_DETAILS];
  let { isVirtualKeyExhausted, isVirtualKeyExpired } = {
    isVirtualKeyExhausted: false,
    isVirtualKeyExpired: false,
  };
  let virtualKeyDetailsObj: VirtualKeyDetails | null = null;
  if (virtualKeyDetails) {
    virtualKeyDetailsObj =
      typeof virtualKeyDetails === 'string'
        ? JSON.parse(virtualKeyDetails)
        : virtualKeyDetails;
    if (virtualKeyDetailsObj) {
      const virtualKeyUsageValidator = await preRequestUsageValidator({
        env: env(c),
        entity: virtualKeyDetailsObj,
        usageLimits: virtualKeyDetailsObj?.usage_limits || [],
        metadata,
        entityType: AtomicKeyTypes.VIRTUAL_KEY,
        entityKey: virtualKeyDetailsObj.id,
        organisationId: organisationDetails.id,
      });
      isVirtualKeyExhausted = virtualKeyUsageValidator.isExhausted;
      isVirtualKeyExpired = virtualKeyUsageValidator.isExpired;
    }
  }
  // Determine error code based on conditions
  let errorCode = '';
  if (isVirtualKeyExhausted || isWorkspaceExhausted || isIntegrationExhausted) {
    errorCode = '04';
  } else if (isVirtualKeyExpired || isWorkspaceExpired) {
    errorCode = '01';
  }

  // Determine error message based on conditions
  let errorMessage = '';
  let errorType = '';
  if (isIntegrationExhausted) {
    errorMessage = `Portkey Integration ${integrationDetails?.slug} Usage Limit Exceeded`;
    errorType = 'integration_exhaust_error';
  } else if (isVirtualKeyExhausted) {
    errorMessage = `Portkey Virtual Key ${hash(virtualKeyDetailsObj?.slug)} Usage Limit Exceeded`;
    errorType = 'virtual_key_exhaust_error';
  } else if (isVirtualKeyExpired) {
    errorMessage = `Portkey Virtual Key ${hash(virtualKeyDetailsObj?.slug)} Expired`;
    errorType = 'virtual_key_expired_error';
  } else if (isWorkspaceExhausted) {
    errorMessage = 'Portkey Workspace Usage Limit Exceeded';
    errorType = 'workspace_exhaust_error';
  } else if (isWorkspaceExpired) {
    errorMessage = 'Portkey Workspace Expired';
    errorType = 'workspace_expired_error';
  }

  const { isExhausted: isUsageLimitsPolicyExhausted, blockingPolicy } =
    await preRequestUsageLimitsPolicyValidator({
      env: env(c),
      organisationDetails,
      metadata,
      virtualKeyDetails: virtualKeyDetailsObj,
      providerSlug: options.provider,
      configId: requestHeaders[PORTKEY_HEADER_KEYS.CONFIG_ID],
      configSlug: requestHeaders[PORTKEY_HEADER_KEYS.CONFIG_SLUG],
      promptId: requestHeaders[PORTKEY_HEADER_KEYS.PROMPT_ID],
      promptSlug: requestHeaders[PORTKEY_HEADER_KEYS.PROMPT_SLUG],
      model: params?.model,
    });

  if (isUsageLimitsPolicyExhausted) {
    errorMessage = `Portkey Usage Limits Policy ${blockingPolicy?.policy.id} Exceeded for value key ${blockingPolicy?.valueKey}`;
    errorType = 'usage_limits_policy_exhaust_error';
    errorCode = '06';
  }

  const errorStatus =
    isVirtualKeyExhausted ||
    isWorkspaceExhausted ||
    isIntegrationExhausted ||
    isUsageLimitsPolicyExhausted
      ? 412
      : 401;
  if (errorCode) {
    return new Response(
      JSON.stringify({
        error: {
          message: errorMessage,
          type: errorType,
          param: null,
          code: errorCode,
        },
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: errorStatus,
      }
    );
  }

  const model = params?.model || null;
  if (integrationDetails && model) {
    const allowAllModels = integrationDetails.allow_all_models;
    let modelDetails = integrationDetails.models?.find(
      (m: any) => m.slug === model
    );
    if (modelDetails) {
      options.modelPricingConfig = modelDetails.pricing_config;
    }
    // Preserve old logic for backward compatibility.
    // TODO: Remove this once we have migrated all the users to the new logic (alias as model).
    if (
      options.provider === AZURE_OPEN_AI &&
      options.azureModelName &&
      !modelDetails
    ) {
      modelDetails = integrationDetails.models?.find(
        (m: any) => m.slug === options.azureModelName
      );
    }
    if (!allowAllModels) {
      if (!modelDetails || modelDetails?.status === 'archived') {
        return new Response(
          JSON.stringify({
            error: {
              message: `Model ${model} is not allowed for this integration`,
              type: 'model_not_allowed_error',
              param: null,
              code: null,
            },
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 412,
          }
        );
      }
    } else {
      if (modelDetails?.status === 'archived') {
        return new Response(
          JSON.stringify({
            error: {
              message: `Model ${model} is not allowed for this integration`,
              type: 'model_not_allowed_error',
              param: null,
              code: null,
            },
          }),
          {
            headers: {
              'content-type': 'application/json',
            },
            status: 412,
          }
        );
      }
    }
  }

  const rateLimitChecks = [];
  if (integrationDetails) {
    rateLimitChecks.push(
      ...preRequestRateLimitValidator({
        env: env(c),
        rateLimits: integrationDetails.rate_limits,
        key: `${integrationDetails.id}-${organisationDetails.workspaceDetails.id}`,
        keyType: RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
        maxTokens,
        organisationId: organisationDetails.id,
      })
    );
  }
  if (virtualKeyDetailsObj) {
    rateLimitChecks.push(
      ...preRequestRateLimitValidator({
        env: env(c),
        rateLimits: virtualKeyDetailsObj.rate_limits,
        key: virtualKeyDetailsObj.id,
        keyType: RateLimiterKeyTypes.VIRTUAL_KEY,
        maxTokens,
        organisationId: organisationDetails.id,
      })
    );
  }

  rateLimitChecks.push(
    ...preRequestRateLimitPolicyValidator({
      env: env(c),
      organisationDetails,
      maxTokens,
      metadata,
      virtualKeyDetails: virtualKeyDetailsObj,
      providerSlug: options.provider,
      configId: requestHeaders[PORTKEY_HEADER_KEYS.CONFIG_ID],
      configSlug: requestHeaders[PORTKEY_HEADER_KEYS.CONFIG_SLUG],
      promptId: requestHeaders[PORTKEY_HEADER_KEYS.PROMPT_ID],
      promptSlug: requestHeaders[PORTKEY_HEADER_KEYS.PROMPT_SLUG],
      model: params?.model,
    })
  );
  const results = await Promise.all(rateLimitChecks);
  let isRateLimitExceeded = false;
  for (const result of results) {
    if (result.allowed === false && !errorMessage) {
      isRateLimitExceeded = true;
      if (result.keyType === RateLimiterKeyTypes.API_KEY) {
        errorMessage = `Portkey API Key ${hash(result.key)} Rate Limit Exceeded`;
        errorType = 'api_key_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.WORKSPACE) {
        errorMessage = `Portkey Workspace ${hash(result.key)} Rate Limit Exceeded`;
        errorType = 'workspace_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.VIRTUAL_KEY) {
        errorMessage = `Portkey Virtual Key ${hash(result.key)} Rate Limit Exceeded`;
        errorType = 'virtual_key_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.INTEGRATION_WORKSPACE) {
        errorMessage = `Portkey Integration ${hash(result.key)} Rate Limit Exceeded`;
        errorType = 'integration_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.RATE_LIMIT_POLICY) {
        const match = result.key.match(
          /^rate-limit-policy-(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))-(.+)$/i
        );
        const policyId = match?.[3];
        const valueKey = match?.[4];
        errorMessage = `Portkey Rate Limit Policy ${policyId} exceeded for value key ${valueKey}`;
        errorType = 'rate_limits_policy_exhaust_error';
      }
    }
  }
  if (isRateLimitExceeded) {
    return new Response(
      JSON.stringify({
        error: {
          message: errorMessage,
          type: errorType,
          param: null,
          code: null,
        },
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 429,
      }
    );
  }
}

/**
 * Converts a value to a JSON string that is safe for use in HTTP headers.
 * HTTP headers only support characters with code points <= 255 (ByteString/ISO-8859-1).
 * This function escapes all non-ASCII characters (code points > 127) to \uXXXX sequences,
 * ensuring the result is pure ASCII. JSON.parse() on the receiving side natively handles
 * these escape sequences, so no corresponding decode step is needed.
 */
export function toHeaderSafeJson(value: any): string {
  return JSON.stringify(value).replace(/[\u0080-\uffff]/g, (char) => {
    return '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

export const hash = (string: string | null | undefined) => {
  if (string === null || string === undefined) return null;
  //remove bearer from the string
  if (string.startsWith('Bearer ')) string = string.slice(7, string.length);
  return (
    string.slice(0, 2) +
    '********' +
    string.slice(string.length - 3, string.length)
  );
};

/**
 * Parses the W3C traceparent header and extracts trace-id and parent-span-id.
 * Format: version-trace-id-parent-id-trace-flags
 * Example: 00-bad90143930ea019df8f681254fb2393-42df8ac2dde4ac52-00
 * Returns: { traceId: 'bad90143930ea019df8f681254fb2393', parentSpanId: '42df8ac2dde4ac52' }
 *
 * The trace-id is the 32-character hex string that uniquely identifies the entire distributed trace.
 * The parent-id is the 16-character hex string that identifies the calling/parent span.
 * When receiving a traceparent, the parent-id represents the span that made the request to us,
 * so it should be used as the parent_span_id of the new span we create.
 *
 * @param {string} traceparent - The traceparent header value.
 * @returns {object | null} The extracted trace-id and parent-span-id or null if invalid.
 */
export function parseTraceparent(
  traceparent: string
): { traceId: string; parentSpanId: string } | null {
  if (!traceparent || typeof traceparent !== 'string') {
    return null;
  }

  const parts = traceparent.trim().split('-');

  // W3C traceparent format: version-trace-id-parent-id-trace-flags
  // Must have exactly 4 parts
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentSpanId, traceFlags] = parts;

  // Validate version (should be 2 hex chars)
  if (!/^[0-9a-f]{2}$/i.test(version)) {
    return null;
  }

  // Validate trace-id (should be 32 hex chars, not all zeros)
  if (
    !/^[0-9a-f]{32}$/i.test(traceId) ||
    traceId === '00000000000000000000000000000000'
  ) {
    return null;
  }

  // Validate parent-span-id (should be 16 hex chars, not all zeros)
  if (
    !/^[0-9a-f]{16}$/i.test(parentSpanId) ||
    parentSpanId === '0000000000000000'
  ) {
    return null;
  }

  // Validate trace-flags (should be 2 hex chars)
  if (!/^[0-9a-f]{2}$/i.test(traceFlags)) {
    return null;
  }

  // Return trace-id and parent-span-id as per W3C Trace Context spec
  return {
    traceId,
    parentSpanId,
  };
}

/**
 * Parses the W3C baggage header and extracts key-value pairs.
 * Format: key1=value1,key2=value2;property1;property2
 * Example: userId=alice,serverNode=DF:28,isProduction=false
 * Returns: { userId: 'alice', serverNode: 'DF:28', isProduction: 'false' }
 *
 * @param {string} baggage - The baggage header value.
 * @returns {Record<string, string>} The extracted key-value pairs.
 */
export function parseBaggage(baggage: string): Record<string, string> {
  if (!baggage || typeof baggage !== 'string') {
    return {};
  }

  const result: Record<string, string> = {};

  // Split by comma to get individual baggage members
  const members = baggage.split(',');

  for (const member of members) {
    const trimmedMember = member.trim();
    if (!trimmedMember) continue;

    // Split by semicolon to separate key=value from properties
    const parts = trimmedMember.split(';');
    const keyValue = parts[0].trim();

    // Split key=value
    const equalIndex = keyValue.indexOf('=');
    if (equalIndex === -1) continue;

    const key = keyValue.substring(0, equalIndex).trim();
    const value = keyValue.substring(equalIndex + 1).trim();

    if (key) {
      // URL decode the value
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Updates headers object with default config_slug and metadata of an api key.
 *
 * @param {Object} headersObj - The original headers object to update.
 * @param {OrganisationDetails} orgDetails - The organisation details object.
 * @param {string} [requestPath] - Optional request path for trace ID generation logic.
 */
export function updateHeaders(
  headersObj: Record<string, string>,
  orgDetails: OrganisationDetails,
  requestPath?: string
) {
  if (
    headersObj[PORTKEY_HEADER_KEYS.CONFIG] &&
    orgDetails.defaults?.config_slug &&
    orgDetails.defaults?.allow_config_override === false
  ) {
    throw new Error('Cannot override default config set for this API key.');
  }
  if (
    !headersObj[PORTKEY_HEADER_KEYS.CONFIG] &&
    (orgDetails.defaults?.config_slug ||
      orgDetails.workspaceDetails?.defaults?.config_slug)
  ) {
    headersObj[PORTKEY_HEADER_KEYS.CONFIG] = (orgDetails.defaults
      ?.config_slug ||
      orgDetails.workspaceDetails?.defaults?.config_slug) as string;
  }

  if (
    orgDetails.workspaceDetails?.defaults?.metadata ||
    orgDetails.defaults?.metadata ||
    orgDetails.apiKeyDetails?.systemDefaults?.user_name
  ) {
    let finalMetadata: Record<string, string> = {};
    try {
      const incomingMetadata = headersObj[PORTKEY_HEADER_KEYS.METADATA]
        ? JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA])
        : {};
      finalMetadata = {
        ...incomingMetadata,
        ...(orgDetails.defaults?.metadata || {}),
        ...(orgDetails.workspaceDetails?.defaults?.metadata || {}),
      };
    } catch (err) {
      finalMetadata = {
        ...(orgDetails.defaults?.metadata || {}),
        ...(orgDetails.workspaceDetails?.defaults?.metadata || {}),
      };
    }
    const systemUserName = orgDetails.apiKeyDetails?.systemDefaults?.user_name;
    if (systemUserName) {
      if (
        orgDetails.apiKeyDetails?.systemDefaults?.user_key_metadata_override
      ) {
        // if override, precedence to existing user passed
        finalMetadata._user = finalMetadata._user || systemUserName;
      } else {
        // use system user name irrespective of passed
        finalMetadata._user = systemUserName;
      }
    }
    headersObj[PORTKEY_HEADER_KEYS.METADATA] = toHeaderSafeJson(finalMetadata);
  }

  // These 2 headers can only be injected by Portkey internally.
  // They are not meant to be passed by the user. So we enforce this by deleting them.
  delete headersObj[PORTKEY_HEADER_KEYS.DEFAULT_INPUT_GUARDRAILS];
  delete headersObj[PORTKEY_HEADER_KEYS.DEFAULT_OUTPUT_GUARDRAILS];

  // Support OpenTelemetry W3C traceparent header
  // When traceparent is provided:
  // - Extract trace-id for distributed tracing correlation
  // - Set parent-span-id from traceparent's parent-id (the caller's span)
  // - Generate a new span-id for the gateway's own span
  // - Set span-name from the request method and path
  // Also handles fallback trace ID generation for non-logger endpoints
  const isCustomLogger = requestPath?.startsWith('/v1/logs');
  const traceparent = headersObj[HEADER_KEYS.TRACEPARENT];
  let traceparentParsed = false;

  if (traceparent) {
    const parsed = parseTraceparent(traceparent);
    if (parsed) {
      traceparentParsed = true;

      // Set trace ID from traceparent if not already set
      if (!headersObj[PORTKEY_HEADER_KEYS.TRACE_ID]) {
        headersObj[PORTKEY_HEADER_KEYS.TRACE_ID] = parsed.traceId;
      }

      // Set parent span ID from traceparent's parent-id (the caller's span)
      if (!headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]) {
        headersObj[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID] = parsed.parentSpanId;
      }

      // Generate a new span ID for the gateway's own span if not already set
      if (!headersObj[PORTKEY_HEADER_KEYS.SPAN_ID]) {
        headersObj[PORTKEY_HEADER_KEYS.SPAN_ID] = crypto
          .randomUUID()
          .replace(/-/g, '')
          .slice(0, 16);
      }

      // Set span name from request method and path if not already set
      if (!headersObj[PORTKEY_HEADER_KEYS.SPAN_NAME] && requestPath) {
        // Extract the method from Accept header or default to POST for chat/completions
        const method =
          headersObj['x-http-method-override'] ||
          (requestPath.includes('/chat/completions') ||
          requestPath.includes('/completions') ||
          requestPath.includes('/embeddings')
            ? 'POST'
            : 'GET');
        headersObj[PORTKEY_HEADER_KEYS.SPAN_NAME] = `${method} ${requestPath}`;
      }
    }
  }

  // If traceparent didn't provide a valid trace ID and this isn't a logger endpoint,
  // generate a random UUID as fallback
  if (
    !headersObj[PORTKEY_HEADER_KEYS.TRACE_ID] &&
    !traceparentParsed &&
    !isCustomLogger
  ) {
    // Custom logger endpoints (/v1/logs) handle their own trace IDs internally
    headersObj[PORTKEY_HEADER_KEYS.TRACE_ID] = crypto.randomUUID();
  }

  // Support OpenTelemetry W3C baggage header for metadata
  // Merge baggage into existing metadata if not already present
  const baggage = headersObj[HEADER_KEYS.BAGGAGE];
  if (baggage) {
    const baggageData = parseBaggage(baggage);
    if (Object.keys(baggageData).length > 0) {
      try {
        const existingMetadata = headersObj[PORTKEY_HEADER_KEYS.METADATA]
          ? JSON.parse(headersObj[PORTKEY_HEADER_KEYS.METADATA])
          : {};
        // Merge baggage into metadata, with existing metadata taking precedence
        const mergedMetadata = {
          ...baggageData,
          ...existingMetadata,
        };
        headersObj[PORTKEY_HEADER_KEYS.METADATA] =
          toHeaderSafeJson(mergedMetadata);
      } catch {
        // If metadata parsing fails, just set baggage as metadata
        headersObj[PORTKEY_HEADER_KEYS.METADATA] =
          toHeaderSafeJson(baggageData);
      }
    }
  }
}

export function constructAzureFoundryURL(
  modelConfig: {
    azureDeploymentType?: string;
    azureDeploymentName?: string;
    azureRegion?: string;
    azureEndpointName?: string;
  } = {}
) {
  if (modelConfig.azureDeploymentType === 'serverless') {
    return `https://${modelConfig.azureDeploymentName?.toLowerCase()}.${modelConfig.azureRegion}.models.ai.azure.com`;
  } else if (modelConfig.azureDeploymentType === 'managed') {
    return `https://${modelConfig.azureEndpointName}.${modelConfig.azureRegion}.inference.ml.azure.com/score`;
  }
}

export function getMode(requestHeaders: Record<string, string>, path: string) {
  let mode =
    requestHeaders[PORTKEY_HEADER_KEYS.MODE]?.split(' ')[0] ?? MODES.PROXY;
  if (
    path === '/v1/chatComplete' ||
    path === '/v1/complete' ||
    path === '/v1/embed'
  ) {
    mode = MODES.RUBEUS;
  } else if (
    path === '/v1/chat/completions' ||
    path === '/v1/messages' ||
    path === '/v1/completions' ||
    path === '/v1/embeddings' ||
    path === '/v1/images/generations' ||
    path === '/v1/images/edits' ||
    path === '/v1/audio/speech' ||
    path === '/v1/audio/transcriptions' ||
    path === '/v1/audio/translations' ||
    path.includes('/v1/batches') ||
    path.includes('/v1/fine_tuning') ||
    path.includes('/v1/files') ||
    (path.startsWith('/v1/prompts') &&
      (path.endsWith('/completions') || path.endsWith('/render'))) ||
    path === '/v1/responses' ||
    path === '/v1/rerank'
  ) {
    mode = MODES.RUBEUS_V2;
  } else if (path.startsWith('/v1/realtime')) {
    mode = MODES.REALTIME;
  } else if (path.indexOf('/v1/proxy') === -1) {
    mode = MODES.PROXY_V2;
  }

  return mode;
}

export const addBackgroundTask = (
  c: Context,
  promise: Promise<void | unknown>,
  useImmediate: boolean = false
) => {
  if (runtime === 'workerd' && !useImmediate) {
    c.executionCtx.waitUntil(promise);
  }
  if (useImmediate) {
    setImmediate(async () => {
      await promise;
    });
  }
  // in other runtimes, the promise resolves in the background
};
