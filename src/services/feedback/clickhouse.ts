import { logger } from '../../apm';
import { getClickhouseClient } from '../../data-stores/clickhouse';
import { uploadLogToAnalyticsStore } from '../winky';
import { globals } from './configs';

export const insertFeedback = async (
  env: Record<string, any>,
  feedbackTable: string,
  feedbackDataArray: any[]
) => {
  const result: any = {};
  try {
    await uploadLogToAnalyticsStore(env, feedbackDataArray, {
      table: feedbackTable,
    });
  } catch (err: any) {
    result.err = err;
    logger.error({
      message: `insertFeedback: ${err.message}`,
    });
  }
  return result;
};

export const deleteFeedbacks = async (
  env: Record<string, any>,
  feedbackTable: string,
  organisationId: string,
  id: string,
  traceId: string,
  source: string
) => {
  const result: any = {};
  const query = `ALTER TABLE ${feedbackTable} DELETE 
  WHERE organisation_id='${organisationId}' 
  AND id = '${id}'
  AND trace_id = '${traceId}'
  AND source = '${source}'`;
  try {
    const client = getClickhouseClient();
    if (!client) {
      result.err = new Error('ClickHouse client not initialized');
      return result;
    }
    await client.command({
      query,
    });
  } catch (err: any) {
    result.err = err;
    logger.error({
      message: `deleteFeedbacks: ${err.message}`,
    });
  }
  return result;
};

export const getFeedback = async (
  env: Record<string, any>,
  db: string | null,
  organisationId: string,
  id: any
) => {
  const result: any = {};
  const query = `SELECT * FROM ${db}.feedbacks 
  WHERE organisation_id='${organisationId}' 
  AND id = '${id}'
  AND source = '${globals.defaultSource}'
  FORMAT json`;

  try {
    const client = getClickhouseClient();
    if (!client) {
      result.err = new Error('ClickHouse client not initialized');
      return result;
    }
    const feedbackQueryResponse = await client.query({
      query,
      format: 'JSONEachRow',
    });

    result.data = await feedbackQueryResponse.json();
  } catch (err: any) {
    result.err = err;
    logger.error({
      message: `getFeedback: ${err.message}`,
    });
  }

  return result;
};
