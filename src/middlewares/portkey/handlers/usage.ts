import { resyncOrganisationData } from '../../../services/albus';
import { requestCache } from '../../../services/cache/cacheService';
import { generateAtomicCounterKey } from '../../../utils/atomicCounter';
import { incrementInMemory } from '../../../utils/cacheKeyTracker';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  AtomicOperations,
  CacheKeyTypes,
  EntityStatus,
} from '../globals';
import {
  AtomicCounterRequestType,
  AtomicCounterResponseType,
  IntegrationDetails,
  OrganisationDetails,
  UsageLimits,
  VirtualKeyDetails,
  WorkspaceDetails,
} from '../types';
import { generateV2CacheKey } from '../../../utils/cacheKey';
import { logger } from '../../../apm';
import { getRuntimeKey } from 'hono/adapter';

async function atomicCounterHandler({
  env,
  organisationId,
  type,
  key,
  amount,
  operation,
  counterType,
  usageLimitId,
  policyId,
  valueKey,
}: Partial<AtomicCounterRequestType> & {
  env?: Record<string, any>;
}): Promise<AtomicCounterResponseType> {
  const cache = requestCache(env);
  const finalKey = generateAtomicCounterKey({
    type,
    organisationId,
    key,
    counterType,
    usageLimitId,
    policyId,
    valueKey,
  });

  const resp: AtomicCounterResponseType = {
    success: true,
    type,
    key,
    value: 0,
  };

  switch (operation) {
    case AtomicOperations.GET:
      resp.value = await cache.getNumber(finalKey);
      break;
    case AtomicOperations.INCREMENT:
      resp.value = await cache.increment(finalKey, amount || 0);
      break;
    case AtomicOperations.DECREMENT:
      resp.value = await cache.decrement(finalKey, amount || 0);
      break;
    case AtomicOperations.RESET:
      await cache.delete(finalKey);
      break;
    default:
      resp.success = false;
      resp.message = 'Invalid Operation';
      break;
  }

  return resp;
}

export async function getCurrentUsage({
  env,
  counterType,
  organisationId,
  type,
  key,
  usageLimitId,
}: Partial<AtomicCounterRequestType> & { env?: Record<string, any> }) {
  return atomicCounterHandler({
    env,
    counterType,
    organisationId,
    type,
    key,
    operation: AtomicOperations.GET,
    usageLimitId,
  });
}

export async function incrementUsage({
  env,
  counterType,
  organisationId,
  type,
  key,
  amount,
  usageLimitId,
}: Partial<AtomicCounterRequestType> & { env?: Record<string, any> }) {
  return atomicCounterHandler({
    env,
    counterType,
    organisationId,
    type,
    key,
    amount,
    operation: AtomicOperations.INCREMENT,
    usageLimitId,
  });
}

export async function resetUsage({
  env,
  organisationId,
  type,
  key,
  counterType,
  usageLimitId,
}: Partial<AtomicCounterRequestType> & { env?: Record<string, any> }) {
  return atomicCounterHandler({
    env,
    counterType,
    organisationId,
    type,
    key,
    operation: AtomicOperations.RESET,
    usageLimitId,
  });
}

function generateIntegrationUsageKey(
  integrationId: string,
  workspaceId: string
) {
  return `${integrationId}-${workspaceId}`;
}

function getIntegrationIdFromUsageKey(key: string, workspaceId: string) {
  return key.endsWith(`-${workspaceId}`)
    ? key.slice(0, -(workspaceId.length + 1))
    : key;
}

/**
 * Pre-request usage validation
 * - Node.js: Checks cached status only (threshold checks happen in resyncDataWorker)
 * - Cloudflare: Real-time check against Durable Object counters
 *
 * @param entityType - Type of entity for generating counter key (API_KEY, WORKSPACE, VIRTUAL_KEY, INTEGRATION_WORKSPACE)
 * @param entityKey - Key/ID of the entity
 * @param organisationId - Organisation ID
 */
export async function preRequestUsageValidator({
  env,
  entity,
  usageLimits,
  metadata,
  entityType,
  entityKey,
  organisationId,
}: {
  env: Record<string, any>;
  entity:
    | OrganisationDetails['apiKeyDetails']
    | WorkspaceDetails
    | VirtualKeyDetails
    | IntegrationDetails
    | null;
  usageLimits: UsageLimits[];
  metadata?: Record<string, string>;
  entityType?: AtomicKeyTypes;
  entityKey?: string;
  organisationId?: string;
}): Promise<{
  isExhausted: boolean;
  isExpired: boolean;
}> {
  let isExhausted = entity?.status === EntityStatus.EXHAUSTED;
  const isExpired = entity?.status === EntityStatus.EXPIRED;

  // Check usage limit statuses
  for (const usageLimit of usageLimits) {
    if (isExhausted) {
      break;
    }
    isExhausted = usageLimit.status === EntityStatus.EXHAUSTED;
  }

  // Quick return if already exhausted/expired from status
  if (isExhausted || isExpired) {
    return { isExhausted, isExpired };
  }

  // For Cloudflare: Real-time check against Durable Object counters
  // Skip for Node.js (threshold checks happen in resyncDataWorker)
  if (
    getRuntimeKey() === 'workerd' &&
    !isExhausted &&
    entityType &&
    entityKey &&
    organisationId
  ) {
    const cache = requestCache(env);

    for (const usageLimit of usageLimits) {
      if (isExhausted) break;

      const { credit_limit, type: counterType, id: usageLimitId } = usageLimit;

      // Skip if no credit limit set
      if (!credit_limit || credit_limit <= 0) {
        continue;
      }

      // Generate the counter key
      const atomicKey = generateAtomicCounterKey({
        type: entityType,
        organisationId,
        key: entityKey,
        counterType,
        usageLimitId,
      });

      try {
        const currentUsage = await cache.getNumber(atomicKey);

        // Convert credit_limit from dollars to cents for cost type
        const isCostType =
          !counterType || counterType === AtomicCounterTypes.COST;
        const creditLimitInUnits = isCostType
          ? credit_limit * 100
          : credit_limit;

        if (currentUsage >= creditLimitInUnits) {
          isExhausted = true;
          break;
        }
      } catch (error: any) {
        logger.error({
          message: `preRequestUsageValidator DO check error: ${error.message}`,
          entityType,
          entityKey,
        });
        // Don't block on error - fall back to status check
      }
    }
  }

  return {
    isExhausted,
    isExpired,
  };
}

export async function postRequestApikeyUsageValidator({
  env,
  organisationDetails,
  apiKey,
  costAmount,
  tokenAmount,
  metadata,
}: {
  env: Record<string, any>;
  organisationDetails: OrganisationDetails;
  apiKey: string;
  costAmount: number;
  tokenAmount: number;
  metadata: Record<string, string>;
}) {
  if (!organisationDetails.settings?.is_api_key_limit_enabled) {
    return;
  }
  const usageLimits = organisationDetails.apiKeyDetails.usageLimits || [];
  const promises = await postRequestUsageValidator({
    env,
    organisationId: organisationDetails.id,
    key: apiKey,
    costAmount,
    tokenAmount,
    metadata,
    usageLimits,
    type: AtomicKeyTypes.API_KEY,
    expiresAt: organisationDetails.apiKeyDetails.expiresAt,
    workspaceId: organisationDetails.workspaceDetails.id,
  });

  if (promises.length) {
    await Promise.all(promises);

    //TODO: delete the api key from kv store
    await requestCache(env).delete(
      generateV2CacheKey({
        cacheKeyType: CacheKeyTypes.API_KEY,
        key: apiKey,
      })
    );
  }
}

export async function postRequestWorkspaceUsageValidator({
  env,
  organisationId,
  workspaceDetails,
  costAmount,
  tokenAmount,
  metadata,
}: {
  env: Record<string, any>;
  organisationId: string;
  workspaceDetails: WorkspaceDetails;
  costAmount: number;
  tokenAmount: number;
  metadata: Record<string, string>;
}) {
  const workspaceUsageLimits = workspaceDetails?.usage_limits || [];
  const promises = await postRequestUsageValidator({
    env,
    organisationId,
    key: workspaceDetails.id,
    costAmount,
    tokenAmount,
    metadata,
    usageLimits: workspaceUsageLimits,
    type: AtomicKeyTypes.WORKSPACE,
    workspaceId: workspaceDetails.id,
  });
  if (promises.length) {
    await Promise.all(promises);
  }
}

export async function postRequestVirtualKeyUsageLimitsValidator({
  env,
  organisationId,
  virtualKeyId,
  costAmount,
  tokenAmount,
  metadata,
  usageLimits,
  virtualKeyDetails,
}: {
  env: Record<string, any>;
  organisationId: string;
  usageLimits: UsageLimits[];
  virtualKeyId: string;
  costAmount: number;
  tokenAmount: number;
  metadata: Record<string, string>;
  virtualKeyDetails: VirtualKeyDetails;
}) {
  const promises = await postRequestUsageValidator({
    env,
    organisationId,
    key: virtualKeyId,
    costAmount,
    tokenAmount,
    metadata,
    usageLimits,
    type: AtomicKeyTypes.VIRTUAL_KEY,
    expiresAt: virtualKeyDetails.expires_at,
    workspaceId: virtualKeyDetails.workspace_id,
  });
  if (promises.length) {
    await Promise.all(promises);
    //TODO: delete the virtual key from kv store
    await requestCache(env).delete(
      generateV2CacheKey({
        organisationId,
        cacheKeyType: CacheKeyTypes.VIRTUAL_KEY,
        workspaceId: virtualKeyDetails.workspace_id,
        key: virtualKeyDetails.slug,
      })
    );
  }
}

export async function postRequestIntegrationUsageLimitsValidator({
  env,
  organisationId,
  workspaceId,
  costAmount,
  tokenAmount,
  metadata,
  usageLimits,
  integrationDetails,
}: {
  env: Record<string, any>;
  organisationId: string;
  workspaceId: string;
  usageLimits: UsageLimits[];
  costAmount: number;
  tokenAmount: number;
  metadata: Record<string, string>;
  integrationDetails: IntegrationDetails;
}) {
  const promises = await postRequestUsageValidator({
    env,
    organisationId,
    key: generateIntegrationUsageKey(integrationDetails.id, workspaceId),
    costAmount,
    tokenAmount,
    metadata,
    usageLimits,
    type: AtomicKeyTypes.INTEGRATION_WORKSPACE,
    workspaceId,
  });
  if (promises.length) {
    await Promise.all(promises);
  }
}

async function postRequestUsageValidator({
  env,
  organisationId,
  workspaceId,
  key,
  costAmount,
  tokenAmount,
  metadata,
  usageLimits,
  type,
  expiresAt,
}: {
  env: Record<string, any>;
  organisationId: string;
  workspaceId: string;
  key: string;
  costAmount: number;
  tokenAmount: number;
  metadata: Record<string, string>;
  usageLimits: UsageLimits[];
  type: AtomicKeyTypes;
  expiresAt?: string;
}) {
  const promises = [];
  if (expiresAt && new Date(expiresAt) < new Date()) {
    const keysToExpire = [
      {
        key: key,
        type: type,
      },
    ];
    const data: any = {
      env,
      organisationId: organisationId,
    };
    if (type === AtomicKeyTypes.API_KEY) {
      data['apiKeysToExpire'] = [key];
    } else if (type === AtomicKeyTypes.VIRTUAL_KEY) {
      data['virtualKeyIdsToExpire'] = [key];
    } else {
      data['keysToExpire'] = keysToExpire;
    }
    promises.push(resyncOrganisationData(data));
  }
  if (!costAmount && !tokenAmount) {
    return promises;
  }

  for (const usageLimit of usageLimits) {
    const {
      type: counterType,
      metadata: usageLimitMetadata,
      status: usageLimitStatus,
      id: usageLimitId,
      credit_limit,
      alert_threshold,
      is_threshold_alerts_sent,
    } = usageLimit;
    if (usageLimitStatus === EntityStatus.EXHAUSTED) {
      continue;
    }
    // Skip if no credit limit set
    if (!credit_limit || credit_limit <= 0) {
      continue;
    }
    const isCostType = !counterType || counterType === AtomicCounterTypes.COST;
    const amount = isCostType ? costAmount : tokenAmount || 0;

    // Increment counter - batched for Node.js, direct for Cloudflare
    const atomicKey = generateAtomicCounterKey({
      type,
      organisationId,
      key,
      counterType,
      usageLimitId,
    });

    // Convert thresholds from dollars to cents for cost type (thresholds stored in dollars, tracking in cents)
    const creditLimitInUnits =
      isCostType && credit_limit != null ? credit_limit * 100 : credit_limit;
    const alertThresholdInUnits =
      isCostType && alert_threshold != null
        ? alert_threshold * 100
        : alert_threshold;

    // Increment with threshold checking (Cloudflare handles thresholds inline, Node.js in resyncDataWorker)
    const incrementResult = await incrementInMemory(
      organisationId,
      atomicKey,
      amount,
      env,
      {
        creditLimit: creditLimitInUnits,
        alertThreshold: alertThresholdInUnits,
        isThresholdAlertsSent: is_threshold_alerts_sent,
      }
    );

    if (incrementResult?.thresholdCrossed) {
      const resyncData: Parameters<typeof resyncOrganisationData>[0] = {
        env,
        organisationId,
      };

      if (incrementResult?.exhausted) {
        // Credit limit crossed - mark as exhausted
        if (type === AtomicKeyTypes.API_KEY) {
          resyncData.apiKeysToExhaust = [key];
        } else if (type === AtomicKeyTypes.VIRTUAL_KEY) {
          resyncData.virtualKeyIdsToExhaust = [key];
        } else if (type === AtomicKeyTypes.INTEGRATION_WORKSPACE) {
          const integrationId = getIntegrationIdFromUsageKey(key, workspaceId);
          resyncData.integrationWorkspacesToExhaust = [
            {
              workspace_id: workspaceId,
              integration_id: integrationId,
            },
          ];
        } else {
          resyncData.keysToExhaust = [
            {
              key,
              type,
              counterType,
              metadata,
              usageLimitId,
            },
          ];
        }
      }

      if (incrementResult?.alertThresholdCrossed) {
        // Alert threshold crossed - send notification
        if (type === AtomicKeyTypes.API_KEY) {
          resyncData.apiKeysToAlertThreshold = [key];
        } else if (type === AtomicKeyTypes.VIRTUAL_KEY) {
          resyncData.virtualKeyIdsToAlertThreshold = [key];
        } else if (type === AtomicKeyTypes.INTEGRATION_WORKSPACE) {
          const integrationId = getIntegrationIdFromUsageKey(key, workspaceId);
          resyncData.integrationWorkspacesToAlertThreshold = [
            {
              workspace_id: workspaceId,
              integration_id: integrationId,
            },
          ];
        } else {
          resyncData.keysToAlertThreshold = [
            {
              key,
              type,
              counterType,
              metadata,
              usageLimitId,
            },
          ];
        }
      }

      try {
        promises.push(resyncOrganisationData(resyncData));
        logger.info({
          message: `Threshold-triggered resync completed`,
          organisationId,
          key,
          type,
          exhausted: incrementResult?.exhausted,
          alertThresholdCrossed: incrementResult?.alertThresholdCrossed,
        });
      } catch (error: any) {
        logger.error({
          message: `Threshold-triggered resync error: ${error.message}`,
          organisationId,
          key,
          type,
        });
      }
    }
  }
  return promises;
}
