import {
  AtomicCounterTypes,
  AtomicKeyTypes,
} from '../middlewares/portkey/globals';
import { resyncOrganisationData } from '../services/albus';
import { generateKeysFromAtomicCounterKey } from '../utils/atomicCounter';
import { runInBatches } from '../utils/misc';
import { Environment } from '../utils/env';
import { requestCache } from '../services/cache/cacheService';
import { logger } from '../apm';
import {
  syncBudgetKeysToRedis,
  getActiveOrganisationIds,
  getBudgetKeysFromRedis,
  removeBudgetKeysFromRedis,
  getInMemoryOrganisationIds,
} from '../utils/cacheKeyTracker';

export async function resyncDataWorker() {
  await syncBudgetKeysToRedis();

  let organisationIds: Set<string> = new Set(
    Environment({}).ORGANISATIONS_TO_SYNC?.split(',').filter(Boolean) || []
  );

  // Full Private deployment
  if (
    Environment({}).PRIVATE_DEPLOYMENT === 'ON' &&
    Environment({}).GATEWAY_CACHE_MODE === 'SELF' &&
    organisationIds.size === 0
  ) {
    organisationIds = await getActiveOrganisationIds();
    const inMemoryOrgIds = getInMemoryOrganisationIds();
    for (const orgId of inMemoryOrgIds) {
      organisationIds.add(orgId);
    }
  }
  if (organisationIds.size === 0) {
    return true;
  }

  for (const organisationId of organisationIds) {
    const budgetKeysToDelete: string[] = [];

    let budgetKeys: Set<string>;
    try {
      budgetKeys = await getBudgetKeysFromRedis(organisationId);
    } catch (error) {
      logger.error(error);
      budgetKeys = new Set();
    }
    if (budgetKeys.size === 0) {
      logger.info(
        `No budget keys found for organisation ${organisationId}, skipping resync`
      );
      continue;
    }
    const keysToUpdateUsage: {
      key: string;
      type: AtomicKeyTypes;
      usageLimitId?: string;
      usage: number;
      counterType?: AtomicCounterTypes;
      policyId?: string;
      valueKey?: string;
    }[] = [];
    const apiKeysToUpdateUsage = [];
    const virtualKeyIdsToUpdateUsage = [];
    const integrationWorkspacesToUpdateUsage = [];
    const usageLimitsPoliciesToUpdateUsage = [];

    const cache = requestCache();
    const keyValueMap = new Map<string, string | null>();
    const keysArray = [...budgetKeys];
    const values = await Promise.all(keysArray.map((key) => cache.get(key)));
    keysArray.forEach((key, i) => {
      keyValueMap.set(key, values[i] as string | null);
    });
    for (const key of budgetKeys) {
      const {
        organisationId: keyOrgId,
        counterType,
        type,
        key: keyPart,
        usageLimitId,
        policyId,
        valueKey,
      } = generateKeysFromAtomicCounterKey(key) || {};

      if (keyOrgId !== organisationId) {
        continue;
      }
      if (!counterType || !type || !keyPart) {
        continue;
      }
      const currUsage = keyValueMap.get(key);
      if (Number(currUsage)) {
        if (type === AtomicKeyTypes.API_KEY) {
          apiKeysToUpdateUsage.push({
            id: keyPart,
            usage: Number(currUsage),
          });
        } else if (type === AtomicKeyTypes.VIRTUAL_KEY) {
          virtualKeyIdsToUpdateUsage.push({
            id: keyPart,
            usage: Number(currUsage),
          });
        } else if (type === AtomicKeyTypes.INTEGRATION_WORKSPACE) {
          const regex =
            /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
          const match = keyPart.match(regex);

          if (match) {
            const integrationId = match[1];
            const workspaceId = match[2];
            integrationWorkspacesToUpdateUsage.push({
              integration_id: integrationId,
              workspace_id: workspaceId,
              usage: Number(currUsage),
            });
          }
        } else if (type === AtomicKeyTypes.USAGE_LIMITS_POLICY) {
          if (policyId && valueKey) {
            usageLimitsPoliciesToUpdateUsage.push({
              id: policyId,
              value_key: valueKey,
              usage: Number(currUsage),
            });
          }
        } else {
          keysToUpdateUsage.push({
            key: keyPart,
            type,
            counterType,
            usage: Number(currUsage),
            usageLimitId,
          });
        }
        budgetKeysToDelete.push(key);
      }
    }
    const promises: Promise<any>[] = [];
    if (
      keysToUpdateUsage.length > 0 ||
      apiKeysToUpdateUsage.length > 0 ||
      virtualKeyIdsToUpdateUsage.length > 0 ||
      integrationWorkspacesToUpdateUsage.length > 0 ||
      usageLimitsPoliciesToUpdateUsage.length > 0
    ) {
      promises.push(
        resyncOrganisationData({
          env: Environment({}),
          organisationId,
          keysToUpdateUsage,
          apiKeysToUpdateUsage,
          virtualKeyIdsToUpdateUsage,
          integrationWorkspacesToUpdateUsage,
          usageLimitsPoliciesToUpdateUsage,
        })
      );
    }
    try {
      await runInBatches(50, promises.length, async (i) => {
        await promises[i];
      });
    } catch (error) {
      logger.error(error);
      continue;
    }
    await Promise.all(budgetKeysToDelete.map((key) => cache.delete(key)));
    await removeBudgetKeysFromRedis(organisationId, budgetKeysToDelete);
  }
  return true;
}
