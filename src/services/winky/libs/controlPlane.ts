import { logger } from '../../../apm';
import {
  AnalyticsLogObjectV2,
  AnalyticsOptions,
  LogOptions,
  LogStoreApmOptions,
} from '../../../middlewares/portkey/types';
import { Environment } from '../../../utils/env';
import { AnalyticsBatcher } from '../../analyticsBatcher';
import { retriableApiReq } from '../utils/helpers';

const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';

export async function logAnalyticsToControlPlane(
  env: Record<string, any>,
  analyticsObjects: AnalyticsLogObjectV2[],
  analyticOptions: AnalyticsOptions
) {
  try {
    const batcher = AnalyticsBatcher.getInstance();
    await batcher.addToBatch(analyticOptions.table, analyticsObjects);
    return true;
  } catch (err: any) {
    logger.error({
      message: `CONTROL_PLANE_ANALYTICS_INSERT_ERROR: ${JSON.stringify({
        errorMessage: err.message,
      })}`,
    });
    return false;
  }
}

export async function pushToControlPlane(
  env: Record<string, any>,
  table: string,
  insertArray: AnalyticsLogObjectV2[]
) {
  if (isPrivateDeployment) {
    const url = `${Environment(env).ALBUS_BASEPATH}/v1/analytics/enterprise/analytics`;
    const body = JSON.stringify({
      table: table,
      data: insertArray,
    });
    try {
      const headers = {
        Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
        'content-type': 'application/json',
      };
      const options = {
        method: 'POST',
        headers,
        body: body,
      };
      await retriableApiReq(env, url, options, 3, !isPrivateDeployment);
      return true;
    } catch (error: any) {
      logger.error({
        message: `CONTROL_PLANE_LOG_PUSH_EXCEPTION: ${JSON.stringify({
          errorMessage: error.message,
        })}`,
      });
      return false;
    }
  } else {
    try {
      const url = `${Environment(env).CONTROL_PLANE_BASEPATH}/dp/metrics`;
      const body = JSON.stringify({
        table: table,
        data: insertArray,
      });
      const headers = {
        'Content-Type': 'application/json',
        Authorization: Environment(env).PORTKEY_CLIENT_AUTH!,
      };
      const options = {
        method: 'POST',
        body: body,
        headers: headers,
      };
      await retriableApiReq(env, url, options, 3);
      return true;
    } catch (err: any) {
      logger.error({
        message: `CONTROL_PLANE_LOG_PUSH_EXCEPTION: ${JSON.stringify({
          errorMessage: err.message,
        })}`,
      });
      return false;
    }
  }
}

export async function uploadLogsToControlPlane(
  env: Record<string, any>,
  logObject: Record<string, any>,
  logOptions: LogOptions,
  apmOptions: LogStoreApmOptions
) {
  const url = `${Environment(env).ALBUS_BASEPATH}/v1/logs/enterprise/logs?organisation_id=${logOptions.organisationId}`;
  let isSuccess = true;
  let errorMessage = '';
  const body = JSON.stringify({
    logObject,
    logOptions,
  });
  try {
    const headers = {
      Authorization: Environment(env).PORTKEY_CLIENT_AUTH,
      'content-type': 'application/json',
    };
    const options = {
      method: 'POST',
      headers,
      body: body,
    };
    await retriableApiReq(env, url, options, 3, !isPrivateDeployment);
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `CONTROL_PLANE_LOG_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}
