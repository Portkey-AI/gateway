import { logger } from '../../../apm';
import { LogStoreApmOptions } from '../../../middlewares/portkey/types';
import {
  awsEndpointDomain,
  getAssumedRoleCredentials,
} from '../../../providers/bedrock/utils';
import { retriableApiReq } from '../utils/helpers';
import { generateAWSHeaders } from './aws';
import { Environment } from '../../../utils/env';
import { createHash } from 'crypto';

const isObjectLockRetentionEnabled =
  Environment({}).LOG_STORE_OBJECT_LOCK_RETENTION_ENABLED === 'true';

export function getS3CompatCreds(env: Record<string, any>) {
  return {
    region: Environment(env).LOG_STORE_REGION,
    accessKey: Environment(env).LOG_STORE_ACCESS_KEY,
    secretKey: Environment(env).LOG_STORE_SECRET_KEY,
    bucket: Environment(env).LOG_STORE_GENERATIONS_BUCKET,
    roleArn: Environment(env).LOG_STORE_AWS_ROLE_ARN,
    externalId: Environment(env).LOG_STORE_AWS_EXTERNAL_ID,
    basePath: Environment(env).LOG_STORE_BASEPATH,
  };
}

export function getS3MD5Header(body: string) {
  if (!isObjectLockRetentionEnabled) {
    return {};
  }
  const md5 = createHash('md5').update(body).digest('base64');
  return {
    'Content-MD5': md5,
  };
}

export async function uploadToS3(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  const { bucket, region, accessKey, secretKey } = getS3CompatCreds(env);
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.s3.${region}.${awsEndpointDomain}/${fullPath}`;
  let isSuccess = true;
  let errorMessage = '';
  const body = JSON.stringify(logObject);
  try {
    const defaultHeaders = {
      'content-type': 'application/json',
      ...getS3EncryptionHeaders(env),
      ...getS3MD5Header(body),
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    };
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
      body,
    };
    await retriableApiReq(env, url, options);
  } catch (error: any) {
    isSuccess = false;
    errorMessage = error.message;
  }
  if (!isSuccess) {
    logger.error({
      message: `S3_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function uploadToS3Assumed(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  let isSuccess = true;
  let errorMessage = '';
  try {
    const { bucket, region, accessKey, secretKey, roleArn, externalId } =
      getS3CompatCreds(env);
    const bucketName = getBucketName(bucket);
    const fullPath = getObjectFullPath(filePath, bucket);
    const url = `https://${bucketName}.s3.${region}.${awsEndpointDomain}/${fullPath}`;

    const assumedCreds = await getAssumedRoleCredentials(
      roleArn,
      externalId,
      region,
      accessKey,
      secretKey
    );

    if (!assumedCreds) {
      throw new Error('Failed to get AWS credentials');
    }

    const { accessKeyId, secretAccessKey, sessionToken } = assumedCreds;

    const body = JSON.stringify(logObject);
    const defaultHeaders = {
      'content-type': 'application/json',
      ...getS3EncryptionHeaders(env),
      ...getS3MD5Header(body),
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    };
    const headers = await generateAWSHeaders(
      undefined,
      defaultHeaders,
      url,
      'PUT',
      's3',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken
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
      message: `S3_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function getFromS3(env: Record<string, any>, filePath: string) {
  const { bucket, region, accessKey, secretKey } = getS3CompatCreds(env);
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.s3.${region}.${awsEndpointDomain}/${fullPath}`;
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
      message: `S3_INSERT_ERROR: ${errorMessage}`,
    });
  }
  return data;
}

export async function getFromS3Assumed(
  env: Record<string, any>,
  filePath: string
) {
  const { bucket, region, accessKey, secretKey, roleArn, externalId } =
    getS3CompatCreds(env);
  const assumedCreds = await getAssumedRoleCredentials(
    roleArn,
    externalId,
    region,
    accessKey,
    secretKey
  );

  if (!assumedCreds) {
    throw new Error('Failed to get AWS credentials');
  }

  const { accessKeyId, secretAccessKey, sessionToken } = assumedCreds;
  const bucketName = getBucketName(bucket);
  const fullPath = getObjectFullPath(filePath, bucket);
  const url = `https://${bucketName}.s3.${region}.${awsEndpointDomain}/${fullPath}`;
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
      accessKeyId,
      secretAccessKey,
      sessionToken
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
      message: `S3_INSERT_ERROR: ${errorMessage}`,
    });
  }
  return data;
}

export function getBucketName(bucket?: string) {
  const bucketValue = processBucketValue(bucket);
  // Split the bucket value into bucket name and base path
  const bucketSplit = bucketValue?.split('/');
  return bucketSplit?.[0];
}

export function getObjectFullPath(path: string, bucket?: string) {
  const bucketValue = processBucketValue(bucket);
  // Split the bucket value into bucket name and optional path
  const bucketSplit = bucketValue?.split('/');
  // Handle the base path logic
  const basePath = bucketSplit?.slice(1).join('/'); // Everything after the bucket name
  const prefix = basePath ? `${basePath}/` : ''; // Ensure trailing slash if basePath exists
  // Remove leading '/' from key if present
  const sanitizedKey = path.startsWith('/') ? path.slice(1) : path;
  // Construct and return the full path
  return `${prefix}${sanitizedKey}`;
}

export function processBucketValue(bucket?: string) {
  return bucket?.trim();
}

export function getS3EncryptionHeaders(env: Record<string, any>) {
  const {
    SSE_ENCRYPTION_TYPE: serverSideEncryption,
    KMS_KEY_ID: kmsKeyId,
    KMS_BUCKET_KEY_ENABLED: kmsBucketKeyEnabled,
    KMS_ENCRYPTION_CONTEXT: kmsEncryptionContext,
    KMS_ENCRYPTION_ALGORITHM: kmsEncryptionAlgorithm,
    KMS_ENCRYPTION_CUSTOMER_KEY: kmsEncryptionCustomerKey,
    KMS_ENCRYPTION_CUSTOMER_KEY_MD5: kmsEncryptionCustomerKeyMD5,
  } = Environment(env);
  return {
    ...(serverSideEncryption && {
      'x-amz-server-side-encryption': serverSideEncryption,
    }),
    ...(kmsKeyId && {
      'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyId,
    }),
    ...(kmsBucketKeyEnabled &&
      kmsBucketKeyEnabled === 'true' && {
        'x-amz-server-side-encryption-bucket-key-enabled': true,
      }),
    ...(kmsEncryptionContext && {
      'x-amz-server-side-encryption-context': kmsEncryptionContext,
    }),
    ...(kmsEncryptionAlgorithm && {
      'x-amz-server-side-encryption-customer-algorithm': kmsEncryptionAlgorithm,
    }),
    ...(kmsEncryptionCustomerKey && {
      'x-amz-server-side-encryption-customer-key': kmsEncryptionCustomerKey,
    }),
    ...(kmsEncryptionCustomerKeyMD5 && {
      'x-amz-server-side-encryption-customer-key-MD5':
        kmsEncryptionCustomerKeyMD5,
    }),
  };
}
