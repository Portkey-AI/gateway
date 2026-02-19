import { logger } from '../../../apm';
import {
  LogOptions,
  LogStoreApmOptions,
} from '../../../middlewares/portkey/types';
import { retriableApiReq } from '../utils/helpers';
import { generateAWSHeaders } from './aws';
import { getBucketName, getObjectFullPath, getS3CompatCreds } from './s3';

export async function uploadToWasabi(
  env: Record<string, any>,
  logObject: Record<string, any>,
  logOptions: LogOptions,
  apmOptions: LogStoreApmOptions
) {
  const s3Creds = getS3CompatCreds(env);
  const bucket = logOptions.bucket || s3Creds.bucket;
  const region = logOptions.region || s3Creds.region;
  const { accessKey, secretKey } = s3Creds;
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(logOptions.filePath, bucket);
  const url = `https://${bucketName}.s3.${region}.wasabisys.com/${fullPath}`;
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
      body: body,
    };
    await retriableApiReq(env, url, options);
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `WASABI_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function getFromWasabi(
  env: Record<string, any>,
  filePath: string
) {
  const { bucket, region, accessKey, secretKey } = getS3CompatCreds(env);
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.s3.${region}.wasabisys.com/${fullPath}`;
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
      message: `WASABI_GET_ERROR: ${errorMessage}`,
    });
  }
  return data;
}
