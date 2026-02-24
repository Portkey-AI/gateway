import { Job } from 'bullmq';
import { logger } from '../apm';
import { Environment } from '../utils/env';
import { uploadLogToLogStore } from '../services/winky';
import { retriableApiReq } from '../services/winky/utils/helpers';

const logReplicaEndpoints =
  Environment({}).ANALYTICS_REPLICA_ENDPOINTS?.split(',') || [];

const pushToLogReplicaEndpoint = async (
  logReplicaEndpoint: string,
  data: any
) => {
  const options = {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json',
    },
  };
  await retriableApiReq(Environment({}), logReplicaEndpoint, options);
};

const pushToS3Bucket = async (data: any) => {
  const day = new Date().toISOString().split('T')[0];
  const hour = new Date().toISOString().split('T')[1].split(':')[0];
  const logOptions = {
    filePath: `${Environment({}).ANALYTICS_REPLICA_WRITE_PREFIX}/${day}/${hour}/${crypto.randomUUID()}.json`,
    organisationId: '',
  };
  return uploadLogToLogStore(Environment({}), data, logOptions, {
    logId: data.id,
    type: 'log-replica-sync',
    organisationId: '',
  });
};

export async function logReplicaSyncWorker(job: Job) {
  const { data } = job.data;
  let result = true;

  const finalData = {
    table: data.table,
    data: data.insertArray,
  };
  for (const logReplicaEndpoint of logReplicaEndpoints) {
    try {
      await pushToLogReplicaEndpoint(
        `${logReplicaEndpoint}/v1/analytics/enterprise/analytics`,
        finalData
      );
    } catch (error) {
      logger.error({
        message: `Unable to push to log replica sync endpoint: ${logReplicaEndpoint}, error: ${error}, writing to s3 bucket`,
      });
      try {
        await pushToS3Bucket(finalData);
      } catch (error) {
        logger.error({
          message: `Unable to write to s3 bucket: ${error}, this job will be retried as per config`,
        });
        result = false;
      }
    }
  }

  return result;
}
