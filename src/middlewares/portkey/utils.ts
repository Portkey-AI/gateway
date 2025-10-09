import { Env, Context } from 'hono';
import { env, getRuntimeKey } from 'hono/adapter';
import {
  AZURE_OPEN_AI,
  BEDROCK,
  CACHE_STATUS,
  EntityStatus,
  GOOGLE,
  HEADER_KEYS,
  MODES,
  RateLimiterKeyTypes,
  RateLimiterTypes,
  VERTEX_AI,
} from './globals';
import { putInCache } from './handlers/cache';
import { forwardToWinky } from './handlers/logger';
import {
  IntegrationDetails,
  OrganisationDetails,
  VirtualKeyDetails,
  WinkyLogObject,
} from './types';
import { checkRateLimits, getRateLimit } from './handlers/helpers';
import { preRequestUsageValidator } from './handlers/usage';
import {
  handleIntegrationRequestRateLimits,
  preRequestRateLimitValidator,
} from './handlers/rateLimits';
import { settings } from '../../../initializeSettings';

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
  let final: Record<string, string> = {};
  const pkHeaderKeys = Object.values(HEADER_KEYS);
  Object.keys(headersObj).forEach((key: string) => {
    if (pkHeaderKeys.includes(key)) {
      final[key] = headersObj[key];
    }
  });
  delete final[HEADER_KEYS.ORGANISATION_DETAILS];
  return final;
}

export async function postResponseHandler(
  winkyBaseLog: WinkyLogObject,
  responseBodyJson: Record<string, any>,
  env: Env
): Promise<void> {
  const cacheResponseBody = { ...responseBodyJson };
  // Put in Cache if needed
  if (
    responseBodyJson &&
    winkyBaseLog.config.cacheType &&
    [
      CACHE_STATUS.MISS,
      CACHE_STATUS.SEMANTIC_MISS,
      CACHE_STATUS.REFRESH,
    ].includes(winkyBaseLog.config.cacheStatus) &&
    winkyBaseLog.responseStatus === 200 &&
    winkyBaseLog.config.organisationDetails?.id &&
    winkyBaseLog.debugLogSetting
  ) {
    const cacheKeyUrl = [MODES.PROXY, MODES.PROXY_V2, MODES.API].includes(
      winkyBaseLog.config.proxyMode
    )
      ? winkyBaseLog.requestURL
      : winkyBaseLog.rubeusURL;

    delete cacheResponseBody.hook_results;
    await putInCache(
      env,
      {
        ...winkyBaseLog.requestHeaders,
        ...winkyBaseLog.config.portkeyHeaders,
      },
      winkyBaseLog.requestBodyParams,
      cacheResponseBody,
      cacheKeyUrl,
      winkyBaseLog.config.organisationDetails.id,
      winkyBaseLog.config.cacheType,
      winkyBaseLog.config.cacheMaxAge
    );
  }

  // Log this request
  if (env.WINKY_WORKER_BASEPATH) {
    await forwardToWinky(env, winkyBaseLog);
  } else if (settings) {
    await handleTokenRateLimit(winkyBaseLog, responseBodyJson, env);
    // TODO: make logs endpoint configurable
  }
  return;
}

export const getStreamingMode = (
  reqBody: Record<string, any>,
  provider: string,
  requestUrl: string,
  rubeusUrl: string
): boolean => {
  if (
    [GOOGLE, VERTEX_AI].includes(provider) &&
    requestUrl.indexOf('stream') > -1
  ) {
    return true;
  }
  if (
    provider === BEDROCK &&
    (requestUrl.indexOf('invoke-with-response-stream') > -1 ||
      requestUrl.indexOf('converse-stream') > -1)
  ) {
    return true;
  }
  if (rubeusUrl === 'imageEdit') {
    return reqBody.get('stream') === 'true';
  }
  return reqBody?.stream;
};

/**
 * Gets the debug log setting based on request headers and organisation details.
 * Priority is given to x-portkey-debug header if its passed in request.
 * Else default org level setting is considered.
 * @param {Record<string, string>} requestHeaders - The headers from the incoming request.
 * @param {OrganisationDetails} organisationDetails - The details of the organisation.
 * @returns {boolean} The debug log setting.
 */
export function getDebugLogSetting(
  requestHeaders: Record<string, string>,
  organisationDetails: OrganisationDetails
): boolean {
  const debugSettingHeader = requestHeaders['x-portkey-debug']?.toLowerCase();

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
  params: Record<string, any>,
  metadata: Record<string, any>
) {
  const organisationDetails = requestHeaders[HEADER_KEYS.ORGANISATION_DETAILS]
    ? JSON.parse(requestHeaders[HEADER_KEYS.ORGANISATION_DETAILS])
    : null;
  const virtualKeyDetails =
    options.virtualKeyDetails ||
    requestHeaders[HEADER_KEYS.VIRTUAL_KEY_DETAILS];
  let virtualKeyDetailsObj: VirtualKeyDetails | null = null;
  if (virtualKeyDetails) {
    virtualKeyDetailsObj =
      typeof virtualKeyDetails === 'string'
        ? JSON.parse(virtualKeyDetails)
        : virtualKeyDetails;
  }
  const integrationDetails =
    options.integrationDetails ||
    requestHeaders[HEADER_KEYS.INTEGRATION_DETAILS];
  let integrationDetailsObj: IntegrationDetails | null = null;
  if (integrationDetails) {
    integrationDetailsObj =
      typeof integrationDetails === 'string'
        ? JSON.parse(integrationDetails)
        : integrationDetails;
  }
  const model = params?.model || null;
  // Validate Statuses
  let errorResponse = await validateEntityStatus(
    c,
    options,
    organisationDetails,
    virtualKeyDetailsObj,
    integrationDetailsObj,
    model,
    metadata
  );
  if (errorResponse) {
    return errorResponse;
  }
  // Validate Rate Limits
  const maxTokens = params.max_tokens || params.max_completion_tokens || 1;
  errorResponse = await validateEntityTokenRateLimits(
    c,
    organisationDetails,
    virtualKeyDetailsObj,
    integrationDetailsObj,
    maxTokens
  );
  if (errorResponse) {
    return errorResponse;
  }
}

async function validateEntityStatus(
  c: Context,
  options: Record<string, any>,
  organisationDetails: OrganisationDetails,
  virtualKeyDetailsObj: VirtualKeyDetails | null,
  integrationDetails: IntegrationDetails | null,
  model: string | null,
  metadata: Record<string, any>
) {
  let isExhausted = false;
  let isExpired = false;
  let errorMessage = '';
  let errorType = '';
  const [
    { isExhausted: isApiKeyExhausted, isExpired: isApiKeyExpired },
    { isExhausted: isWorkspaceExhausted, isExpired: isWorkspaceExpired },
    { isExhausted: isVirtualKeyExhausted, isExpired: isVirtualKeyExpired },
    { isExhausted: isIntegrationExhausted, isExpired: isIntegrationExpired },
  ] = await Promise.all([
    preRequestUsageValidator({
      env: env(c),
      entity: organisationDetails.apiKeyDetails,
      usageLimits: organisationDetails.apiKeyDetails?.usageLimits || [],
      metadata,
    }),
    preRequestUsageValidator({
      env: env(c),
      entity: organisationDetails.workspaceDetails,
      usageLimits: organisationDetails.workspaceDetails?.usage_limits || [],
      metadata,
    }),
    validateVirtualKeyStatus(c, virtualKeyDetailsObj, metadata),
    validateIntegrationStatus(c, integrationDetails, metadata),
  ]);

  if (isApiKeyExhausted) {
    isExhausted = true;
    errorMessage = `Portkey API Key Usage Limit ${hash(
      organisationDetails.apiKeyDetails.key
    )} Exceeded`;
    errorType = 'api_key_exhaust_error';
  } else if (isWorkspaceExhausted) {
    isExhausted = true;
    errorMessage = `Portkey Workspace Usage Limit ${hash(
      organisationDetails.workspaceDetails.slug
    )} Exceeded`;
    errorMessage = 'Portkey Workspace Usage Limit Exceeded';
    errorType = 'workspace_exhaust_error';
  } else if (isVirtualKeyExhausted) {
    isExhausted = true;
    errorMessage = `Portkey Virtual Key Usage Limit ${hash(
      virtualKeyDetailsObj?.slug
    )} Exceeded`;
    errorType = 'virtual_key_exhaust_error';
  } else if (isIntegrationExhausted) {
    isExhausted = true;
    errorMessage = `Portkey Integration Usage Limit ${hash(
      integrationDetails?.slug
    )} Exceeded`;
    errorType = 'integration_exhaust_error';
  }
  if (isApiKeyExpired) {
    isExpired = true;
    errorMessage = `Portkey API Key Usage Limit ${hash(
      organisationDetails.apiKeyDetails.key
    )} Expired`;
    errorType = 'api_key_expired_error';
  } else if (isWorkspaceExpired) {
    isExpired = true;
    errorMessage = `Portkey Workspace Usage Limit ${hash(
      organisationDetails.workspaceDetails.slug
    )} Expired`;
    errorType = 'workspace_expired_error';
  } else if (isVirtualKeyExpired) {
    isExpired = true;
    errorMessage = `Portkey Virtual Key Usage Limit ${hash(
      virtualKeyDetailsObj?.slug
    )} Expired`;
    errorType = 'virtual_key_expired_error';
  } else if (isIntegrationExpired) {
    isExpired = true;
    errorMessage = `Portkey Integration Usage Limit ${hash(
      integrationDetails?.slug
    )} Expired`;
    errorType = 'integration_expired_error';
  }
  if (isExhausted) {
    return new Response(
      JSON.stringify({
        error: {
          message: errorMessage,
          type: errorType,
          param: null,
          code: '04',
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
  if (isExpired) {
    return new Response(
      JSON.stringify({
        error: {
          message: errorMessage,
          type: errorType,
          param: null,
          code: '01',
        },
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 401,
      }
    );
  }
  if (
    integrationDetails &&
    model &&
    !validateIntegrationModel(c, options, integrationDetails, model)
  ) {
    return new Response(
      JSON.stringify({
        error: {
          message: `Model ${model} is not allowed for this integration`,
          type: 'model_not_allowed_error',
          param: null,
          code: null,
        },
      })
    );
  }
}

async function validateEntityTokenRateLimits(
  c: Context,
  organisationDetails: OrganisationDetails,
  virtualKeyDetails: VirtualKeyDetails | null,
  integrationDetails: IntegrationDetails | null,
  maxTokens: number
) {
  const rateLimitChecks: any[] = [];
  rateLimitChecks.push(
    ...validateApiKeyTokenRateLimits(c, organisationDetails, maxTokens)
  );
  rateLimitChecks.push(
    ...validateWorkspaceTokenRateLimits(c, organisationDetails, maxTokens)
  );
  if (virtualKeyDetails) {
    rateLimitChecks.push(
      ...validateVirtualKeyRateLimits(c, virtualKeyDetails, maxTokens)
    );
  }
  if (integrationDetails) {
    rateLimitChecks.push(
      ...validateIntegrationRateLimits(
        c,
        organisationDetails,
        integrationDetails,
        maxTokens
      )
    );
  }
  const results = await Promise.all(rateLimitChecks);
  let isRateLimitExceeded = false;
  let errorMessage = '';
  let errorType = '';
  for (const resp of results) {
    const result = await resp.json();
    if (result.allowed === false && !errorMessage) {
      isRateLimitExceeded = true;
      if (result.keyType === RateLimiterKeyTypes.API_KEY) {
        errorMessage = `Portkey API Key ${hash(
          result.key
        )} Rate Limit Exceeded`;
        errorType = 'api_key_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.WORKSPACE) {
        errorMessage = `Portkey Workspace ${hash(
          result.key
        )} Rate Limit Exceeded`;
        errorType = 'workspace_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.VIRTUAL_KEY) {
        errorMessage = `Portkey Virtual Key ${hash(
          result.key
        )} Rate Limit Exceeded`;
        errorType = 'virtual_key_rate_limit_error';
      } else if (result.keyType === RateLimiterKeyTypes.INTEGRATION_WORKSPACE) {
        errorMessage = `Portkey Integration ${hash(
          result.key
        )} Rate Limit Exceeded`;
        errorType = 'integration_rate_limit_error';
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

function validateApiKeyTokenRateLimits(
  c: Context,
  organisationDetails: OrganisationDetails,
  maxTokens: number
) {
  // validate only token rate limits
  const rateLimits = organisationDetails.apiKeyDetails?.rateLimits?.filter(
    (rateLimit) => rateLimit.type === RateLimiterTypes.TOKENS
  );
  return preRequestRateLimitValidator({
    env: env(c),
    rateLimits: rateLimits || [],
    key: organisationDetails.apiKeyDetails?.key,
    keyType: RateLimiterKeyTypes.API_KEY,
    maxTokens,
    organisationId: organisationDetails.id,
  });
}

function validateWorkspaceTokenRateLimits(
  c: Context,
  organisationDetails: OrganisationDetails,
  maxTokens: number
) {
  // validate only token rate limits
  const workspaceRateLimits =
    organisationDetails.workspaceDetails?.rate_limits?.filter(
      (rateLimit) => rateLimit.type === RateLimiterTypes.TOKENS
    );
  return preRequestRateLimitValidator({
    env: env(c),
    rateLimits: workspaceRateLimits || [],
    key: organisationDetails.workspaceDetails?.slug,
    keyType: RateLimiterKeyTypes.WORKSPACE,
    maxTokens,
    organisationId: organisationDetails.id,
  });
}

function validateVirtualKeyStatus(
  c: Context,
  virtualKeyDetailsObj: VirtualKeyDetails | null,
  metadata: Record<string, any>
) {
  if (!virtualKeyDetailsObj) {
    return {
      isExhausted: false,
      isExpired: false,
    };
  }
  return preRequestUsageValidator({
    env: env(c),
    entity: virtualKeyDetailsObj,
    usageLimits: virtualKeyDetailsObj?.usage_limits || [],
    metadata,
  });
}

function validateVirtualKeyRateLimits(
  c: Context,
  virtualKeyDetailsObj: VirtualKeyDetails,
  maxTokens: number
) {
  return preRequestRateLimitValidator({
    env: env(c),
    rateLimits: virtualKeyDetailsObj?.rate_limits || [],
    key: virtualKeyDetailsObj?.id,
    keyType: RateLimiterKeyTypes.VIRTUAL_KEY,
    maxTokens,
    organisationId: virtualKeyDetailsObj?.organisation_id,
  });
}

function validateIntegrationStatus(
  c: Context,
  integrationDetails: IntegrationDetails | null,
  metadata: Record<string, any>
) {
  if (!integrationDetails) {
    return {
      isExhausted: false,
      isExpired: false,
    };
  }
  return preRequestUsageValidator({
    env: env(c),
    entity: integrationDetails,
    usageLimits: integrationDetails?.usage_limits || [],
    metadata,
  });
}

function validateIntegrationModel(
  c: Context,
  options: Record<string, any>,
  integrationDetails: IntegrationDetails,
  model: string
) {
  let isModelAllowed = true;
  if (integrationDetails && model) {
    const allowAllModels = integrationDetails.allow_all_models;
    let modelDetails;
    if (!allowAllModels) {
      modelDetails = integrationDetails.models?.find((m) => m.slug === model);
      // Preserve old logic for backward compatibility.
      // TODO: Remove this once we have migrated all the users to the new logic (alias as model).
      if (
        options.provider === AZURE_OPEN_AI &&
        options.azureModelName &&
        !modelDetails
      ) {
        modelDetails = integrationDetails.models?.find(
          (m) => m.slug === options.azureModelName
        );
      }

      if (modelDetails) {
        options.modelPricingConfig = modelDetails.pricing_config;
      }

      if (!modelDetails || modelDetails?.status === EntityStatus.ARCHIVED) {
        isModelAllowed = false;
      }
    }
  }
  return isModelAllowed;
}

function validateIntegrationRateLimits(
  c: Context,
  organisationDetails: OrganisationDetails,
  integrationDetails: IntegrationDetails,
  maxTokens: number
) {
  return preRequestRateLimitValidator({
    env: env(c),
    rateLimits: integrationDetails.rate_limits,
    key: `${integrationDetails.id}-${organisationDetails.workspaceDetails.id}`,
    keyType: RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
    maxTokens,
    organisationId: organisationDetails.id,
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
 * Updates headers object with default config_slug and metadata of an api key.
 *
 * @param {Object} headersObj - The original headers object to update.
 * @param {OrganisationDetails} orgDetails - The organisation details object.
 */
export function updateHeaders(
  headersObj: Record<string, string>,
  orgDetails: OrganisationDetails
) {
  if (
    headersObj[HEADER_KEYS.CONFIG] &&
    orgDetails.apiKeyDetails?.defaults?.config_slug &&
    orgDetails.apiKeyDetails?.defaults?.allow_config_override === false
  ) {
    throw new Error('Cannot override default config set for this API key.');
  }

  if (
    !headersObj[HEADER_KEYS.CONFIG] &&
    (orgDetails.apiKeyDetails?.defaults?.config_slug ||
      orgDetails.workspaceDetails?.defaults?.config_slug)
  ) {
    headersObj[HEADER_KEYS.CONFIG] = (orgDetails.apiKeyDetails?.defaults
      ?.config_slug ||
      orgDetails.workspaceDetails?.defaults?.config_slug) as string;
  }

  if (
    orgDetails.workspaceDetails?.defaults?.metadata ||
    orgDetails.apiKeyDetails?.defaults?.metadata ||
    orgDetails.apiKeyDetails?.systemDefaults?.user_name
  ) {
    let finalMetadata: Record<string, string> = {};
    try {
      const incomingMetadata = headersObj[HEADER_KEYS.METADATA]
        ? JSON.parse(headersObj[HEADER_KEYS.METADATA])
        : {};
      finalMetadata = {
        ...incomingMetadata,
        ...(orgDetails.apiKeyDetails?.defaults?.metadata || {}),
        ...(orgDetails.workspaceDetails?.defaults?.metadata || {}),
      };
    } catch (err) {
      finalMetadata = {
        ...(orgDetails.apiKeyDetails?.defaults?.metadata || {}),
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
    headersObj[HEADER_KEYS.METADATA] = JSON.stringify(finalMetadata);
  }

  // These 2 headers can only be injected by Portkey internally.
  // They are not meant to be passed by the user. So we enforce this by deleting them.
  delete headersObj[HEADER_KEYS.DEFAULT_INPUT_GUARDRAILS];
  delete headersObj[HEADER_KEYS.DEFAULT_OUTPUT_GUARDRAILS];
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
    return `https://${modelConfig.azureDeploymentName?.toLowerCase()}.${
      modelConfig.azureRegion
    }.models.ai.azure.com`;
  } else if (modelConfig.azureDeploymentType === 'managed') {
    return `https://${modelConfig.azureEndpointName}.${modelConfig.azureRegion}.inference.ml.azure.com/score`;
  }
}

export const addBackgroundTask = (
  c: Context,
  promise: Promise<void | unknown>
) => {
  if (runtime === 'workerd') {
    c.executionCtx.waitUntil(promise);
  }
  // in other runtimes, the promise resolves in the background
};

export const handleTokenRateLimit = (
  winkyBaseLog: WinkyLogObject,
  responseBodyJson: Record<string, any>,
  env: any
) => {
  let totalTokens = 0;
  if (winkyBaseLog.responseStatus >= 200 && winkyBaseLog.responseStatus < 300) {
    switch (winkyBaseLog.rubeusURL) {
      case 'chatComplete':
      case 'complete':
        totalTokens = responseBodyJson.usage.total_tokens;
        break;
      case 'messages':
        totalTokens =
          responseBodyJson.usage?.input_tokens +
          (responseBodyJson.usage?.cache_creation_input_tokens ?? 0) +
          (responseBodyJson.usage?.cache_read_input_tokens ?? 0) +
          responseBodyJson.usage.output_tokens;
        break;
      default:
        totalTokens = 0;
    }
    // do not await results
    handleIntegrationRequestRateLimits(env, winkyBaseLog, totalTokens);
  }
};
