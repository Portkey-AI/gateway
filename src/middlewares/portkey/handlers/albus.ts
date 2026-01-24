import { AtomicCounterTypes, AtomicKeyTypes, CacheKeyTypes } from '../globals';
import { WorkspaceDetails } from '../types';
import { generateV2CacheKey } from './cache';
import { fetchFromKVStore, putInKVStore } from './kv';
import { fetchOrganisationProviderFromSlugFromFile } from './configFile';

const isLocalConfigEnabled = process?.env?.FETCH_SETTINGS_FROM_FILE === 'true';

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
  if (isLocalConfigEnabled) {
    if (url.includes('/v2/virtual-keys/')) {
      return fetchOrganisationProviderFromSlugFromFile(url);
    }
  }
  try {
    const response = await fetch(url, options);

    if (response.ok) {
      const responseFromAlbus: any = await response.json();
      return responseFromAlbus;
    } else {
      console.log(
        'not found in albus',
        url,
        await response.clone().text(),
        response.status,
        JSON.stringify(options)
      );
    }
  } catch (error) {
    console.log('error in fetching API Key from Albus', error);
  }

  return null;
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
  env: any,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  providerKeySlug: string,
  refetch?: boolean
): Promise<any | null> => {
  const cacheKey = generateV2CacheKey({
    organisationId,
    workspaceId: workspaceDetails.id,
    cacheKeyType: CacheKeyTypes.VIRTUAL_KEY,
    key: providerKeySlug,
  });
  if (!refetch) {
    const responseFromKV = await fetchFromKVStore(env, cacheKey);

    if (responseFromKV) {
      return responseFromKV;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/virtual-keys/${providerKeySlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await putInKVStore(env, cacheKey, responseFromAlbus);
  }

  return responseFromAlbus;
};

export const updateOrganisationProviderKey = async (
  env: any,
  orgApiKey: string,
  organisationId: string,
  workspaceDetails: WorkspaceDetails,
  providerKeyId: string,
  providerKeySlug: string,
  updateObj: any
): Promise<any | null> => {
  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/virtual-keys/${providerKeyId}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
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
  env: any,
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
  let configDetailsFromKV = await fetchFromKVStore(env, cacheKey);
  if (configDetailsFromKV) {
    return {
      organisationConfig: JSON.parse(configDetailsFromKV.config),
      configVersion: configDetailsFromKV.version_id,
    };
  }

  //fetch from albus
  const albusUrl = `${env.ALBUS_BASEPATH}/v2/configs/${configSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus: any = await fetchFromAlbus(
    albusUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    // found in albus add to KV cache(async) and return
    await putInKVStore(env, cacheKey, responseFromAlbus);
    return {
      organisationConfig: JSON.parse(responseFromAlbus.config),
      configVersion: responseFromAlbus.version_id,
    };
  }

  return null;
};

export const fetchOrganisationPrompt = async (
  env: any,
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
    const responseFromCache = await fetchFromKVStore(env, cacheKey);
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/prompts/${promptSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await putInKVStore(env, cacheKey, responseFromAlbus);
    return responseFromAlbus;
  }
  return null;
};

export const fetchOrganisationPromptPartial = async (
  env: any,
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
    const responseFromCache = await fetchFromKVStore(env, cacheKey);
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/prompts/partials/${promptPartialSlug}?organisation_id=${organisationId}&workspace_id=${workspaceDetails.id}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await putInKVStore(env, cacheKey, responseFromAlbus);
    return responseFromAlbus;
  }
  return null;
};

export const fetchOrganisationGuardrail = async (
  env: any,
  orgId: string,
  workspaceId: string | null,
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
    const responseFromCache = await fetchFromKVStore(env, cacheKey);
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/guardrails/${guardrailSlug}?organisation_id=${orgId}${workspaceId ? `&workspace_id=${workspaceId}` : ''}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );
  if (responseFromAlbus) {
    await putInKVStore(env, cacheKey, responseFromAlbus);
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
    const responseFromCache = await fetchFromKVStore(env, cacheKey);
    if (responseFromCache) {
      return responseFromCache;
    }
  }

  //check in albus, return and save in KV if found
  const albusFetchUrl = `${env.ALBUS_BASEPATH}/v2/integrations/?organisation_id=${orgId}`;
  const albusFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id-gateway': env.CLIENT_ID,
    },
  };

  const responseFromAlbus = await fetchFromAlbus(
    albusFetchUrl,
    albusFetchOptions
  );

  if (responseFromAlbus) {
    await putInKVStore(env, cacheKey, responseFromAlbus.data);
    return responseFromAlbus.data;
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
}) {
  const path = `${env.ALBUS_BASEPATH}/v1/organisation/${organisationId}/resync`;
  const options: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: env.PORTKEY_CLIENT_AUTH,
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
      keysToExpire,
      keysToExhaust,
      keysToAlertThreshold,
      keysToUpdateUsage,
      integrationWorkspacesToUpdateUsage,
    }),
  };
  return fetch(path, options);
}
