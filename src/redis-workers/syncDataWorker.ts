import { logger } from '../apm';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  CacheKeyTypes,
  EntityStatus,
} from '../middlewares/portkey/globals';
import { generateV2CacheKey } from '../utils/cacheKey';
import { generateAtomicCounterKey } from '../utils/atomicCounter';
import {
  incrementInMemory,
  getPromptCacheKeysFromRedis,
  removePromptCacheKeysFromRedis,
} from '../utils/cacheKeyTracker';
import {
  getMcpServerTokenKeysFromRedis,
  clearMcpServerTokenTrackingSet,
} from '../mcp/utils/mcpCacheKeyTracker';
import { invalidateServerCache } from '../mcp/services/mcpAccessService';
import { requestCache } from '../services/cache/cacheService';
import { runInBatches } from '../utils/misc';
import { SyncTransactionDataFormat } from './types';
import { version } from '../../package.json';
import { Environment } from '../utils/env';
import { externalServiceFetch, internalServiceFetch } from '../utils/fetch';
import { destroyCircuitBreakerConfig } from '../utils/circuitBreaker';
import { randomUUID } from 'crypto';
import { Job } from 'bullmq';

const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';
const isSelfCacheMode = Environment({}).GATEWAY_CACHE_MODE === 'SELF';
const isManagedDeployment = Environment({}).MANAGED_DEPLOYMENT === 'ON';

export async function syncDataWorker(job: Job) {
  if (isPrivateDeployment && isSelfCacheMode) {
    return true;
  }

  const organisationId = job.data.organisationId;

  if (organisationId) {
    //make a GET call to source sync API for each organisation id
    const syncIdentifierKey = `SYNC_IDENTIFIER-${organisationId}`;
    const cache = requestCache();
    let syncIdentifier = await cache.get(syncIdentifierKey);
    if (!syncIdentifier) {
      syncIdentifier = `SYNC_ID_${randomUUID()}`;
      await cache.set(syncIdentifierKey, syncIdentifier);
    }

    const queryParams = `?version=${version}&identifier=${syncIdentifier}`;
    const path = `${Environment({}).ALBUS_BASEPATH}/v1/organisation/${organisationId}/sync/0${queryParams}`;

    const response = await (
      isPrivateDeployment ? internalServiceFetch : externalServiceFetch
    )(path, {
      headers: {
        Authorization: Environment({}).PORTKEY_CLIENT_AUTH as string,
      },
    });

    if (!response.ok) {
      logger.error({
        message: `syncDataWorker error: ${await response.clone().text()}`,
      });
      return false;
    }

    const responseData = await response.json<{
      data: SyncTransactionDataFormat;
    }>();
    const data = responseData.data;

    const resetPromises: Promise<unknown>[] = [];

    // Track all prompt cache keys that need to be removed from tracking Set
    const promptKeysToRemoveFromTracking: string[] = [];

    const prompts = new Set<string>();
    data.promptsV2?.forEach((item) => {
      // get all prompts modified
      prompts.add(item.slug.split('@')[0]);
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.PROMPT,
        key: item.slug,
        workspaceId: item.workspace_id,
      });
      resetPromises.push(cache.delete(key));
      // Track for removal from tracking Set
      promptKeysToRemoveFromTracking.push(key);
    });

    // Invalidate related prompt cache entries using tracking Set (no SCAN needed)
    if (prompts.size) {
      const trackedPromptKeys =
        await getPromptCacheKeysFromRedis(organisationId);
      for (const trackedPKey of trackedPromptKeys) {
        const parts = trackedPKey.split('_');
        if (parts.length >= 2) {
          const promptKey = parts[1];
          const [prompt, tag] = promptKey.includes('@')
            ? promptKey.split('@')
            : [promptKey, null];
          if (prompts.has(prompt) && (tag === null || isNaN(Number(tag)))) {
            resetPromises.push(cache.delete(trackedPKey));
            promptKeysToRemoveFromTracking.push(trackedPKey);
          }
        }
      }
    }

    data.virtualKeysV2?.forEach((item) => {
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.VIRTUAL_KEY,
        key: item.slug,
        workspaceId: item.workspace_id,
      });
      resetPromises.push(cache.delete(key));
    });

    data.configsV2?.forEach((item) => {
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.CONFIG,
        key: item.slug,
        workspaceId: item.workspace_id,
      });
      resetPromises.push(cache.delete(key));
      resetPromises.push(
        destroyCircuitBreakerConfig(
          item.slug,
          item.workspace_id,
          organisationId
        )
      );
    });

    data.promptPartialsV2?.forEach((item) => {
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.PROMPT_PARTIAL,
        key: item.slug,
        workspaceId: item.workspace_id,
      });
      resetPromises.push(cache.delete(key));
      // Track for removal from tracking Set
      promptKeysToRemoveFromTracking.push(key);
    });

    // Remove all deleted prompt/partial keys from tracking Set (single operation)
    if (promptKeysToRemoveFromTracking.length > 0) {
      resetPromises.push(
        removePromptCacheKeysFromRedis(
          organisationId,
          promptKeysToRemoveFromTracking
        ).then(() => undefined)
      );
    }

    data.guardrailsV2?.forEach((item) => {
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.GUARDRAIL,
        key: item.slug,
        workspaceId: item.workspace_id,
      });
      resetPromises.push(cache.delete(key));
    });

    data.integrationsV2?.forEach(() => {
      const key = generateV2CacheKey({
        organisationId: organisationId,
        cacheKeyType: CacheKeyTypes.INTEGRATIONS,
        key: 'all',
      });
      resetPromises.push(cache.delete(key));
    });

    // Handle exhausted values - using Redis Sets for better performance
    if (data.usageLimitsPolicyUpdatedValues?.length) {
      const policIdActiveValueKeysMap = new Map();
      const policIdExhaustedValueKeysMap = new Map();
      const policyIdWorkspacesMap = new Map();

      for (const item of data.usageLimitsPolicyUpdatedValues) {
        policyIdWorkspacesMap.set(item.policy_id, item.workspace_id);
        const activeValueKeys =
          policIdActiveValueKeysMap.get(item.policy_id) || [];
        const exhaustedValueKeys =
          policIdExhaustedValueKeysMap.get(item.policy_id) || [];
        if (item.status === EntityStatus.ACTIVE) {
          activeValueKeys.push(item.value_key);
          policIdActiveValueKeysMap.set(item.policy_id, activeValueKeys);
        } else if (item.status === EntityStatus.EXHAUSTED) {
          exhaustedValueKeys.push(item.value_key);
          policIdExhaustedValueKeysMap.set(item.policy_id, exhaustedValueKeys);
        }
      }

      for (const [policyId, workspaceId] of policyIdWorkspacesMap) {
        const key = generateV2CacheKey({
          organisationId: organisationId,
          cacheKeyType: CacheKeyTypes.USAGE_LIMITS_POLICY_EXHAUSTED,
          key: policyId,
          workspaceId: workspaceId,
        });

        // Use KV wrapper Set operations
        const exhaustedKeys = policIdExhaustedValueKeysMap.get(policyId) || [];
        const activeKeys = policIdActiveValueKeysMap.get(policyId) || [];

        // Add exhausted values to Redis Set
        if (exhaustedKeys.length > 0) {
          resetPromises.push(cache.addToSet(key, ...exhaustedKeys));
        }

        // Remove active values from Redis Set
        if (activeKeys.length > 0) {
          resetPromises.push(cache.removeFromSet(key, ...activeKeys));
        }
      }
    }

    if (data.virtualKeysWithBudgets) {
      for (const item of data.virtualKeysWithBudgets) {
        const existingBudgetKey = `${organisationId}-${AtomicKeyTypes.VIRTUAL_KEY}-${item.id}`;
        const existingValue = await cache.get(existingBudgetKey);
        if (Number(existingValue)) {
          // Generate the full atomic counter key and increment in memory
          const atomicKey = generateAtomicCounterKey({
            type: AtomicKeyTypes.VIRTUAL_KEY,
            organisationId: organisationId,
            key: item.id,
            counterType: item.usage_type as AtomicCounterTypes,
          });
          incrementInMemory(organisationId, atomicKey, Number(existingValue));
          resetPromises.push(cache.delete(existingBudgetKey));
        }
      }
    }

    if (data.apiKeyIdsWithBudgets) {
      for (const item of data.apiKeyIdsWithBudgets) {
        const existingBudgetKey = `${organisationId}-${AtomicKeyTypes.API_KEY}-${item.key}`;
        const existingValue = await cache.get(existingBudgetKey);
        if (Number(existingValue)) {
          // Generate the full atomic counter key and increment in memory
          const atomicKey = generateAtomicCounterKey({
            type: AtomicKeyTypes.API_KEY,
            organisationId: organisationId,
            key: item.key,
            counterType: item.usage_type as AtomicCounterTypes,
          });
          incrementInMemory(organisationId, atomicKey, Number(existingValue));
          resetPromises.push(cache.delete(existingBudgetKey));
        }
      }
    }

    const apiKeyIdPromises: Promise<{ key: string } | null>[] = [];
    const apiKeyIds: string[] = [];
    data.apiKeyIds?.forEach((id) => {
      const cacheKey = generateV2CacheKey({
        cacheKeyType: CacheKeyTypes.API_KEY_ID,
        key: id,
      });
      apiKeyIdPromises.push(cache.get(cacheKey));
      apiKeyIds.push(id);
    });

    data.apiKeysToReset?.forEach((id) => {
      const cacheKey = generateV2CacheKey({
        cacheKeyType: CacheKeyTypes.API_KEY_ID,
        key: id,
      });
      apiKeyIdPromises.push(cache.get(cacheKey));
      apiKeyIds.push(id);
    });

    const apiKeyToIdMap = new Map();

    const apiKeyIdToKeyResults: ({ key: string } | null)[] = await runInBatches(
      50,
      apiKeyIds.length,
      async (j) => {
        return apiKeyIdPromises[j];
      }
    );
    const apiKeyIdToKeyData = apiKeyIdToKeyResults.filter(Boolean);

    for (let j = 0; j < apiKeyIdToKeyData.length; j++) {
      const apiIdKeyData = apiKeyIdToKeyData[j];
      apiKeyToIdMap.set(apiKeyIds[j], apiIdKeyData?.key);
      if (apiIdKeyData?.key) {
        const cacheKey = generateV2CacheKey({
          cacheKeyType: CacheKeyTypes.API_KEY,
          key: apiIdKeyData?.key,
        });
        resetPromises.push(cache.delete(cacheKey));
      }
    }

    // Handle MCP Server cache invalidation (enterprise only, not for managed SaaS)
    if (data.mcpServersV2?.length) {
      for (const item of data.mcpServersV2) {
        const serverId = item.slug;
        const workspaceId = item.workspace_id;

        // 1. Invalidate MCP server config cache
        // The MCP config cache key format is: `{workspaceId}/{serverId}`
        // with namespace `mcp:config`
        const configCacheKey = generateV2CacheKey({
          organisationId: organisationId,
          cacheKeyType: CacheKeyTypes.MCP_SERVER_CONFIG,
          key: `${workspaceId}/${serverId}`,
          workspaceId: workspaceId,
        });
        resetPromises.push(cache.delete(configCacheKey));

        // 2. If reset_tokens flag is set, invalidate all cached tokens for this server
        if (item.reset_tokens) {
          logger.info({
            message: `Invalidating all tokens for MCP server ${workspaceId}/${serverId}`,
            organisationId,
          });

          // Get all tracked token keys for this server
          const trackedTokenKeys = await getMcpServerTokenKeysFromRedis(
            organisationId,
            workspaceId,
            serverId
          );

          // Delete each tracked token
          for (const tokenKey of trackedTokenKeys) {
            resetPromises.push(cache.delete(tokenKey));
          }

          // Clear the tracking Set for this server
          resetPromises.push(
            clearMcpServerTokenTrackingSet(
              organisationId,
              workspaceId,
              serverId
            )
          );
        }

        // 3. If reset_capabilities flag is set, invalidate capabilities cache for this server
        if (item.reset_capabilities) {
          logger.info({
            message: `Invalidating capabilities cache for MCP server ${workspaceId}/${serverId}`,
            organisationId,
          });

          // Invalidate the disabled capabilities cache
          resetPromises.push(invalidateServerCache(serverId, workspaceId));
        }
      }
    }

    await runInBatches(50, resetPromises.length, (j) => resetPromises[j]);
  }
  return true;
}
