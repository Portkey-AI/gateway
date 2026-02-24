import { logger } from '../../../apm';
import { getClickhouseClient } from '../../../data-stores/clickhouse';
import { AnalyticsLogObjectV2 } from '../../../middlewares/portkey/types';
import { AnalyticsBatcher } from '../../analyticsBatcher';

export const logToClickhouse = async (
  env: Record<string, any>,
  analyticsObjects: AnalyticsLogObjectV2[],
  table: string
): Promise<boolean> => {
  try {
    const batcher = AnalyticsBatcher.getInstance();
    await batcher.addToBatch(table, analyticsObjects);
    return true;
  } catch (err: any) {
    logger.error({
      message: `Failed to add to Clickhouse batch: ${err.message}`,
    });
    return false;
  }
};

export const pushToClickhouse = async (
  env: Record<string, any>,
  table: string,
  insertArray: AnalyticsLogObjectV2[]
): Promise<boolean> => {
  try {
    const client = getClickhouseClient();
    if (!client) {
      logger.error({
        message: 'ClickHouse client not initialized',
      });
      return false;
    }
    await client.insert({
      table: table,
      format: 'JSONEachRow',
      values: insertArray,
    });
  } catch (err: any) {
    logger.error({
      message: `Failed to push to Clickhouse: ${err.message}`,
    });
    return false;
  }
  return true;
};
