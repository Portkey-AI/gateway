import { Environment } from '../utils/env';
import { queues } from './queueWorkers';

const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';
const isSelfCacheMode = Environment({}).GATEWAY_CACHE_MODE === 'SELF';

export async function syncDataMasterWorker() {
  if (isPrivateDeployment && isSelfCacheMode) {
    return true;
  }

  const organisationIds =
    Environment({}).ORGANISATIONS_TO_SYNC?.split(',') || [];
  if (organisationIds.length === 0) {
    return true;
  }

  const queue = queues['syncDataQueue'];
  for (const orgId of organisationIds) {
    await queue.add(`sync-org-${orgId}`, {
      organisationId: orgId,
    });
  }

  return true;
}
