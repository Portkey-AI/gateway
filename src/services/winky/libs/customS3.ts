import { logger } from '../../../apm';
import { LogStoreApmOptions } from '../../../middlewares/portkey/types';
import { retriableApiReq } from '../utils/helpers';
import { generateAWSHeaders } from './aws';
import { getS3CompatCreds, getS3EncryptionHeaders } from './s3';

export async function uploadToCustomS3(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  const { region, accessKey, secretKey, basePath } = getS3CompatCreds(env);
  const url = `${basePath}/${filePath}`;
  let isSuccess = true;
  let errorMessage = '';
  const body = JSON.stringify(logObject);
  const defaultHeaders = {
    'content-type': 'application/json',
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    ...getS3EncryptionHeaders(env),
  };
  try {
    const headers = await generateAWSHeaders(
      undefined,
      defaultHeaders,
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
      message: `CUSTOM_S3_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function getFromCustomS3(
  env: Record<string, any>,
  filePath: string
) {
  const { region, accessKey, secretKey, basePath } = getS3CompatCreds(env);
  const url = `${basePath}/${filePath}`;
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
      message: `CUSTOM_S3_GET_ERROR: ${errorMessage}`,
    });
  }
  return data;
}
