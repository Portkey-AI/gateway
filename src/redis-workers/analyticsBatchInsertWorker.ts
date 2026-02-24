import { Job } from 'bullmq';
import { pushToControlPlane } from '../services/winky/libs/controlPlane';
import { pushToClickhouse } from '../services/winky/libs/clickhouse';
import { logger } from '../apm';
import { ANALYTICS_STORES } from '../services/winky/utils/constants';
import { pushAnalyticsObjectsToOTel } from '../services/winky/libs/openTelemetry';
import { Environment } from '../utils/env';
import { queues } from './queueWorkers';

const isOtelEnabled =
  Environment({}).OTEL_PUSH_ENABLED === 'true' && Environment({}).OTEL_ENDPOINT;

const isLogReplicationEnabled =
  Environment({}).ANALYTICS_REPLICATION_ENABLED === 'true';

export async function processAnalyticsBatch(
  table: string,
  insertArray: any[]
): Promise<boolean> {
  const analyticsStore =
    Environment({}).ANALYTICS_STORE || ANALYTICS_STORES.CLICKHOUSE;
  let result = true;
  if (analyticsStore === ANALYTICS_STORES.CONTROL_PLANE) {
    result = await pushToControlPlane(Environment({}), table, insertArray);
  } else if (analyticsStore === ANALYTICS_STORES.CLICKHOUSE) {
    result = await pushToClickhouse(Environment({}), table, insertArray);
  } else {
    logger.error({
      message: `Invalid analytics store: ${analyticsStore}`,
    });
    return false;
  }

  if (isOtelEnabled) {
    try {
      await pushAnalyticsObjectsToOTel(Environment({}), insertArray);
    } catch (error) {
      logger.error({
        message: `Failed to push analytics objects to OTel collector, error: ${error}`,
      });
    }
  }

  return result;
}

export async function analyticsBatchInsertWorker(job: Job) {
  const { data } = job.data;
  const { table, insertArray } = data;

  const result = await processAnalyticsBatch(table, insertArray);

  // Log replication only works with queues (not in direct insert mode)
  if (isLogReplicationEnabled) {
    try {
      await queues['logReplicaSyncQueue'].add('logReplicaSyncJob', {
        data,
      });
    } catch (error) {
      logger.error({
        message: `analyticsBatchInsertWorker log replication failure, error: ${error}`,
      });
    }
  }

  if (!result) {
    logger.error({
      message: `analyticsBatchInsertWorker failure`,
    });
  }

  return result;
}
