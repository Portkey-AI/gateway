import { logger } from '../../apm';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  CacheKeyTypes,
  PORTKEY_HEADER_KEYS,
} from '../../middlewares/portkey/globals';
import { generateV2CacheKey } from '../../utils/cacheKey';
import { WorkspaceDetails } from '../../middlewares/portkey/types';
import { version } from '../../../package.json';
import { externalServiceFetch, internalServiceFetch } from '../../utils/fetch';
import { Environment } from '../../utils/env';
import { trackPromptCacheKey } from '../../utils/cacheKeyTracker';
import { requestCache } from '../cache/cacheService';
import { fetchOrganisationProviderFromSlugFromFile } from './configFile';
import { computeSHA256 } from '../../utils';

const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';
const isLocalConfigEnabled =
  Environment({}).FETCH_SETTINGS_FROM_FILE === 'true';

/**
 * Asynchronously fetch data from Albus.
 *
 * @param {string} url - The URL to fetch data from.
 * @param {any} options - method and headers for the fetch request.
 * @returns {Promise<any|null>} - A Promise that resolves to the fetched data or null if an error occurs.
 */
const fetchFromAlbus = async (
  url: string,
  options: any
): Promise<any | null> => {
  try {
    const response = await (
      isPrivateDeployment ? internalServiceFetch : externalServiceFetch
    )(url, options);

    if (response.ok) {
      const responseFromAlbus: any = await response.json();
      return responseFromAlbus.data || responseFromAlbus;
    }
  } catch (error) {
    logger.error('fetchFromAlbus error', error);
  }

  return null;
};

export const fetchApiKeyDetails = async (
  env: Record<string, any>,
  apiKey: string,
  refetch?: boolean
) => {
  /**
   * Make a call to KV to get the organisation ID from API Key
   *       if found
   *              return
   *       if the KV cache returns null, make a call to albus to get the organisation ID
   *          if found in albus
   *              return
   *              store the API key with organisation ID in KV cache
   *          if not found
   *              if the albus call returns null, return null
   */

  let cacheKey;
  let sha1Key = apiKey;
  try {
    if (apiKey.length > 50) {
      sha1Key = await computeSHA256(apiKey);
    }
  } catch (error) {
    logger.error('Failed to compute SHA-1 hash for API key', error);
  }
  if (!refetch) {
    //check in KV cache, return if found
    cacheKey = generateV2CacheKey({
      cacheKeyType: CacheKeyTypes.API_KEY,
      key: sha1Key,
    });
    try {
      const data = await requestCache(env).get<any>(cacheKey, {
        useLocalCache: true,
      });
      if (data) return data;
    } catch (error: any) {
      logger.error({
        message: `fetchApiKeyDetails Cache get error: ${error.message}`,
      });
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/api-keys/self/details?include_organisation=true&include_workspace=true`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
      [PORTKEY_HEADER_KEYS.AUTHORIZATION]: Environment(env).PORTKEY_CLIENT_AUTH,
    },
  };

  try {
    const response = await (
      isPrivateDeployment ? internalServiceFetch : externalServiceFetch
    )(albusFetchUrl, albusFetchOptions);
    if (response.status === 200) {
      const responseFromAlbus: any = await response.json();
      if (responseFromAlbus !== null) {
        const { api_key_details } = responseFromAlbus.data;
        const apiKeyIdCacheKey = generateV2CacheKey({
          cacheKeyType: CacheKeyTypes.API_KEY_ID,
          key: api_key_details.id,
        });

        const expiresAt = api_key_details.expires_at;
        let cacheExpiry = 604800; // 1 week
        if (expiresAt) {
          const toExpireInSeconds = Math.floor(
            (new Date(expiresAt).getTime() - Date.now()) / 1000
          );
          cacheExpiry = Math.min(cacheExpiry, toExpireInSeconds);
          if (cacheExpiry <= 0) {
            // api key expired
            return null;
          }
        }

        const apiKeyIdCacheValue = {
          key: apiKey,
        };
        if (!cacheKey) {
          cacheKey = generateV2CacheKey({
            cacheKeyType: CacheKeyTypes.API_KEY,
            key: apiKey,
          });
        }
        // found in albus add to KV cache(async) and return
        await requestCache(env).set(cacheKey, responseFromAlbus.data, {
          ttl: cacheExpiry,
        });
        await requestCache(env).set(apiKeyIdCacheKey, apiKeyIdCacheValue, {
          ttl: cacheExpiry,
        });
        return responseFromAlbus.data || responseFromAlbus;
      }
    }
    return null;
  } catch (error: any) {
    logger.error({
      message: `fetchOrganisationIdFromAPIKey error: ${error.message}`,
    });
  }
};
/**
 * Asynchronously fetches virtual key details using the virtual key slug.
 *
 * @param {any} env - Hono environment object
 * @param {string} orgApiKey - The API key for the organization.
 * @param {string} organisationId - The ID of the organization.
 * @param {string} providerKeySlug - The virtual key slugs.
 * @returns {Promise<any | null>} - A Promise that resolves to the fetched data or null if an error occurs.
 */
export const fetchOrganisationProviderFromSlug = async (
  env: Record<string, any>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  providerKeySlug: string,
  refetch?: boolean
): Promise<any | null> => {
  let cacheKey;
  if (!refetch) {
    cacheKey = generateV2CacheKey({
      organisationId,
      workspaceId: workspaceDetails.id,
      cacheKeyType: CacheKeyTypes.VIRTUAL_KEY,
      key: providerKeySlug,
    });
    const responseFromKV = await requestCache(env).get<any>(cacheKey, {
      useLocalCache: true,
    });

    if (responseFromKV) {
      return responseFromKV;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/virtual-keys/${providerKeySlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: orgApiKey,
    },
  };

  const responseFromAlbus = isLocalConfigEnabled
    ? await fetchOrganisationProviderFromSlugFromFile(albusFetchUrl)
    : await fetchFromAlbus(albusFetchUrl, albusFetchOptions);
  if (responseFromAlbus) {
    if (!cacheKey) {
      cacheKey = generateV2CacheKey({
        organisationId,
        workspaceId: responseFromAlbus.workspace_id,
        cacheKeyType: CacheKeyTypes.VIRTUAL_KEY,
        key: providerKeySlug,
      });
    }
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
  }

  return responseFromAlbus;
};

export const updateOrganisationProviderKey = async (
  env: Record<string, any>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  providerKeyId: string,
  providerKeySlug: string,
  updateObj: any
): Promise<any | null> => {
  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/virtual-keys/${providerKeyId}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: orgApiKey,
    },
    body: JSON.stringify(updateObj),
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await fetchOrganisationProviderFromSlug(
      env,
      orgApiKey,
      organisationId,
      workspaceDetails,
      providerKeySlug,
      true
    );
  }
};

/**
 * Fetches organization configuration details based on the given parameters.
 *
 * @param {Object} env - Hono configuration object.
 * @param {string} orgApiKey - Organisation portkey API key.
 * @param {string} organisationId - Organisation ID.
 * @param {string} configSlug - Config slug identifier.
 * @returns {Promise<any|null>} A Promise that resolves to the organization configuration details,
 *                                or null if the configuration is not found or if it fails.
 */
export const fetchOrganisationConfig = async (
  env: Record<string, any>,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  configSlug: string
) => {
  const cacheKey = generateV2CacheKey({
    organisationId,
    workspaceId: workspaceDetails.id,
    cacheKeyType: CacheKeyTypes.CONFIG,
    key: configSlug,
  });
  // fetch the config based on configSlug
  const configDetailsFromKV = await requestCache(env).get<any>(cacheKey, {
    useLocalCache: true,
  });
  if (configDetailsFromKV) {
    return {
      organisationConfig: JSON.parse(configDetailsFromKV.config),
      configVersion: configDetailsFromKV.version_id,
    };
  }

  //fetch from albus
  const albusUrl = `${Environment(env).ALBUS_BASEPATH}/v2/configs/${configSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: orgApiKey,
    },
  };

  const responseFromAlbus: any = await fetchFromAlbus(
    albusUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    // found in albus add to KV cache(async) and return
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
    return {
      organisationConfig: JSON.parse(responseFromAlbus.config),
      configVersion: responseFromAlbus.version_id,
    };
  }

  return null;
};

export const fetchOrganisationPrompt = async (
  env: Record<string, any>,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  apiKey: string,
  promptSlug: string,
  isCacheRefreshEnabled: boolean
) => {
  //check in KV cache, return if found
  const cacheKey = generateV2CacheKey({
    organisationId,
    workspaceId: workspaceDetails.id,
    cacheKeyType: CacheKeyTypes.PROMPT,
    key: promptSlug,
  });

  if (!isCacheRefreshEnabled) {
    const responseFromCache = await requestCache(env).get<any>(cacheKey, {
      useLocalCache: true,
    });
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/prompts/${promptSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
    trackPromptCacheKey(organisationId, cacheKey);
    return responseFromAlbus;
  }
  return null;
};

export const fetchOrganisationPromptPartial = async (
  env: Record<string, any>,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  apiKey: string,
  promptPartialSlug: string,
  isCacheRefreshEnabled: boolean
) => {
  //check in KV cache, return if found
  const cacheKey = generateV2CacheKey({
    organisationId,
    workspaceId: workspaceDetails.id,
    cacheKeyType: CacheKeyTypes.PROMPT_PARTIAL,
    key: promptPartialSlug,
  });
  if (!isCacheRefreshEnabled) {
    const responseFromCache = await requestCache(env).get<any>(cacheKey, {
      useLocalCache: true,
    });
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/prompts/partials/${promptPartialSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
    trackPromptCacheKey(organisationId, cacheKey);
    return responseFromAlbus;
  }
  return null;
};

export async function resyncOrganisationData({
  env,
  organisationId,
  apiKeysToReset,
  apiKeysToExhaust,
  apiKeysToExpire,
  apiKeysToAlertThreshold,
  apiKeysToUpdateUsage,
  virtualKeyIdsToReset,
  virtualKeyIdsToAlertThreshold,
  virtualKeyIdsToExhaust,
  virtualKeyIdsToExpire,
  virtualKeyIdsToUpdateUsage,
  keysToExpire,
  keysToExhaust,
  keysToAlertThreshold,
  keysToUpdateUsage,
  integrationWorkspacesToUpdateUsage,
  usageLimitsPoliciesToUpdateUsage,
  usageLimitsPoliciesToExhaust,
  integrationWorkspacesToExhaust,
  integrationWorkspacesToAlertThreshold,
  markFirstGenerationDone,
  verificationCode,
}: {
  env: Record<string, any>;
  organisationId: string;
  apiKeysToReset?: string[];
  apiKeysToExhaust?: string[];
  apiKeysToExpire?: string[];
  apiKeysToAlertThreshold?: string[];
  apiKeysToUpdateUsage?: { id: string; usage: number }[];
  virtualKeyIdsToReset?: string[];
  virtualKeyIdsToAlertThreshold?: string[];
  virtualKeyIdsToExhaust?: string[];
  virtualKeyIdsToExpire?: string[];
  virtualKeyIdsToUpdateUsage?: { id: string; usage: number }[];
  keysToExpire?: {
    key: string;
    type: AtomicKeyTypes;
  }[];
  keysToExhaust?: {
    key: string;
    type: AtomicKeyTypes;
    counterType?: AtomicCounterTypes;
    metadata?: Record<string, string>;
    usageLimitId?: string;
  }[];
  keysToAlertThreshold?: {
    key: string;
    type: AtomicKeyTypes;
    counterType?: AtomicCounterTypes;
    metadata?: Record<string, string>;
    usageLimitId?: string;
  }[];
  keysToUpdateUsage?: {
    key: string;
    type: AtomicKeyTypes;
    counterType?: AtomicCounterTypes;
    metadata?: Record<string, string>;
    usageLimitId?: string;
  }[];
  integrationWorkspacesToUpdateUsage?: {
    integration_id: string;
    workspace_id: string;
    usage: number;
  }[];
  usageLimitsPoliciesToUpdateUsage?: {
    id: string;
    value_key: string;
    usage: number;
  }[];
  usageLimitsPoliciesToExhaust?: {
    id: string;
    value_key: string;
  }[];
  integrationWorkspacesToExhaust?: {
    integration_id: string;
    workspace_id: string;
  }[];
  integrationWorkspacesToAlertThreshold?: {
    integration_id: string;
    workspace_id: string;
  }[];
  markFirstGenerationDone?: boolean;
  verificationCode?: string;
}) {
  const path = `${Environment(env).ALBUS_BASEPATH}/v1/organisation/${organisationId}/resync`;
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
    },
    body: JSON.stringify({
      apiKeysToReset,
      apiKeysToExhaust,
      apiKeysToExpire,
      apiKeysToAlertThreshold,
      apiKeysToUpdateUsage,
      virtualKeyIdsToReset,
      virtualKeyIdsToExhaust,
      virtualKeyIdsToExpire,
      virtualKeyIdsToAlertThreshold,
      virtualKeyIdsToUpdateUsage,
      version,
      keysToExpire,
      keysToExhaust,
      keysToAlertThreshold,
      keysToUpdateUsage,
      integrationWorkspacesToUpdateUsage,
      usageLimitsPoliciesToUpdateUsage,
      usageLimitsPoliciesToExhaust,
      integrationWorkspacesToExhaust,
      integrationWorkspacesToAlertThreshold,
      markFirstGenerationDone,
      verificationCode,
    }),
  };
  return internalServiceFetch(path, options);
}

export const fetchOrganisationGuardrail = async (
  env: any,
  orgId: string,
  workspaceId: string | null,
  apiKey: string,
  guardrailSlug: string,
  isCacheRefreshEnabled: boolean
) => {
  //check in KV cache, return if found
  const cacheKey = generateV2CacheKey({
    organisationId: orgId,
    cacheKeyType: CacheKeyTypes.GUARDRAIL,
    key: guardrailSlug,
    workspaceId,
  });

  if (!isCacheRefreshEnabled) {
    const responseFromCache = await requestCache(env).get<any>(cacheKey, {
      useLocalCache: true,
    });
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/guardrails/${guardrailSlug}?organisation_id=${orgId}${workspaceId ? `&workspace_id=${workspaceId}` : ''}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
    return responseFromAlbus;
  }
  return null;
};

export const fetchOrganisationIntegrations = async (
  env: any,
  orgId: string,
  apiKey: string,
  isCacheRefreshEnabled: boolean
) => {
  //check in KV cache, return if found
  const cacheKey = generateV2CacheKey({
    organisationId: orgId,
    cacheKeyType: CacheKeyTypes.INTEGRATIONS,
    key: 'all',
  });

  if (!isCacheRefreshEnabled) {
    const responseFromCache = await requestCache(env).get<any>(cacheKey, {
      useLocalCache: true,
    });
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${Environment(env).ALBUS_BASEPATH}/v2/integrations/?organisation_id=${orgId}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );

  if (responseFromAlbus) {
    await requestCache(env).set(cacheKey, responseFromAlbus, { ttl: 604800 });
    return responseFromAlbus;
  }
  return null;
};
