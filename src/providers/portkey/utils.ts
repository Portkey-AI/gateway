import { generateAWSHeaders } from '../../services/winky/libs/aws';
import {
  getBucketName,
  getObjectFullPath,
  getS3CompatCreds,
  getS3EncryptionHeaders,
} from '../../services/winky/libs/s3';
import { LOG_STORES } from '../../services/winky/utils/constants';
import { Environment } from '../../utils/env';
import {
  externalServiceFetchWithNodeFetch,
  internalServiceFetch,
} from '../../utils/fetch';
import { awsEndpointDomain, getAssumedRoleCredentials } from '../bedrock/utils';

export const getBatchDetails = async (
  batchDetailsURL: string,
  options?: RequestInit,
  headers?: Record<string, string>
) => {
  const result = { error: null, data: null } as {
    error: Error | null | any;
    data: any;
  };
  const baseOptions = {
    headers: headers,
  };

  const finalOptions = {
    ...baseOptions,
    ...options,
  };
  try {
    const response = await internalServiceFetch(batchDetailsURL, finalOptions);

    if (!response.ok) {
      const error = await response.json();
      result.error = error;
    } else {
      result.data = (await response.json()) as {
        portkey_options: Record<string, any>;
        provider_details: Record<string, any>;
      };
    }
  } catch (e) {
    result.error = e as Error;
  }
  return result;
};

export const getFileFromLogStore = async (
  env: Record<string, any>,
  bucket: string,
  key: string
) => {
  const logStore = Environment(env).LOG_STORE;
  let url;
  let headers;

  if (logStore === LOG_STORES.S3 || logStore === LOG_STORES.S3_ASSUME) {
    let accessKeyId;
    let secretAccessKey;
    let sessionToken;

    const { accessKey, region, secretKey, roleArn, externalId } =
      getS3CompatCreds(env);

    accessKeyId = accessKey;
    secretAccessKey = secretKey;
    // if logstore is s3 assume, get the assumed role credentials
    if (logStore === LOG_STORES.S3_ASSUME) {
      const assumedCreds = await getAssumedRoleCredentials(
        roleArn,
        externalId,
        region,
        accessKey,
        secretKey
      );
      if (assumedCreds) {
        accessKeyId = assumedCreds.accessKeyId;
        secretAccessKey = assumedCreds.secretAccessKey;
        sessionToken = assumedCreds.sessionToken;
      }
    }
    const bucketName = getBucketName(bucket);
    const fullPath = getObjectFullPath(key, bucket);
    url = `https://${bucketName}.s3.${region}.${awsEndpointDomain}/${fullPath}`;

    headers = await generateAWSHeaders(
      undefined,
      {
        ...getS3EncryptionHeaders(env),
      },
      url,
      'GET',
      's3',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken
    );
  } else if (logStore === LOG_STORES.WASABI) {
    const { region, accessKey, secretKey } = getS3CompatCreds(env);
    const bucketName = getBucketName(bucket);
    const fullPath = getObjectFullPath(key, bucket);
    url = `https://${bucketName}.s3.${region}.wasabisys.com/${fullPath}`;

    headers = await generateAWSHeaders(
      undefined,
      {
        'content-type': 'application/json',
      },
      url,
      'GET',
      's3',
      region,
      accessKey,
      secretKey,
      undefined
    );
  } else if (logStore === LOG_STORES.S3_CUSTOM) {
    const { region, accessKey, secretKey, basePath } = getS3CompatCreds(env);
    url = `${basePath}/${key}`;

    headers = await generateAWSHeaders(
      undefined,
      {
        'content-type': 'application/json',
      },
      url,
      'GET',
      's3',
      region,
      accessKey,
      secretKey,
      undefined
    );
  } else {
    return new Response('Invalid Log store found!', { status: 404 });
  }

  const options = {
    method: 'GET',
    headers,
  };
  const response = await externalServiceFetchWithNodeFetch(url!, options);
  return response;
};
