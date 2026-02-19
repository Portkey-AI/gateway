import { retriableApiReq } from '../utils/helpers';
import { generateAWSHeaders } from './aws';
import { getBucketName, getObjectFullPath, getS3CompatCreds } from './s3';
import { logger } from '../../../apm';
import { getGcpIdentityAccessToken } from '../../../providers/google-vertex-ai/utils';
import { LogStoreApmOptions } from '../../../middlewares/portkey/types';
import { Environment } from '../../../utils/env';

export async function uploadToGcs(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  const { bucket, region, accessKey, secretKey } = getS3CompatCreds(env);
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.storage.googleapis.com/${fullPath}`;
  let isSuccess = true;
  let errorMessage = '';
  const body = JSON.stringify(logObject);
  try {
    const headers = await generateAWSHeaders(
      undefined,
      {
        'content-type': 'application/json',
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      url,
      'PUT',
      's3',
      region,
      accessKey,
      secretKey
    );
    const options = {
      method: 'PUT',
      headers,
      body,
    };
    await retriableApiReq(env, url, options);
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `GCS_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function uploadToGcsAssumed(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  const bucket = Environment(env).LOG_STORE_GENERATIONS_BUCKET;
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
  const jsonData = JSON.stringify(logObject);
  const contentLength = Buffer.byteLength(jsonData);
  const accessToken = await getGcpIdentityAccessToken();

  if (!accessToken) {
    logger.error({ message: 'Error getting GCP Access Token' });
    return;
  }
  const authorization = `Bearer ${accessToken}`;

  const options = {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      'Content-Length': contentLength,
    },
    body: jsonData,
  };

  let isSuccess = true;
  let errorMessage = '';
  try {
    await retriableApiReq(env, url, options as any);
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `GCS_ASSUMED_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function getFromGcs(env: Record<string, any>, filePath: string) {
  const { bucket, region, accessKey, secretKey } = getS3CompatCreds(env);
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.storage.googleapis.com/${fullPath}`;
  let isSuccess = true;
  let errorMessage = '';
  let data;
  try {
    const headers = await generateAWSHeaders(
      undefined,
      { 'content-type': 'application/json' },
      url,
      'GET',
      's3',
      region,
      accessKey,
      secretKey
    );
    const options = {
      method: 'GET',
      headers,
    };
    const resp = await retriableApiReq(env, url, options);
    data = await resp.json();
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `GCS_GET_ERROR: ${errorMessage}`,
    });
  }
  return data;
}

export async function getFromGcsAssumed(
  env: Record<string, any>,
  filePath: string
) {
  const bucket = Environment(env).LOG_STORE_GENERATIONS_BUCKET;

  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
  const accessToken = await getGcpIdentityAccessToken();

  if (!accessToken) {
    logger.error({ message: 'Error getting GCP Access Token' });
    return;
  }

  const authorization = `Bearer ${accessToken}`;

  const options = {
    method: 'GET',
    headers: {
      Authorization: authorization,
    },
  };
  let isSuccess = true;
  let errorMessage = '';
  let data;
  try {
    const resp = await retriableApiReq(env, url, options);
    data = await resp.json();
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `GCS_ASSUMED_GET_ERROR: ${errorMessage}`,
    });
  }
  return data;
}
