import { createHmac } from 'crypto';
import { retriableApiReq } from '../utils/helpers';
import { logger } from '../../../apm';
import { LogStoreApmOptions } from '../../../middlewares/portkey/types';
import {
  getAccessTokenFromEntraId,
  getAzureManagedIdentityToken,
} from '../../../providers/azure-openai/utils';
import { getBucketName, getObjectFullPath } from './s3';
import { Environment } from '../../../utils/env';

export async function uploadToAzureStorage(
  env: Record<string, any>,
  logObject: Record<string, any>,
  filePath: string,
  apmOptions: LogStoreApmOptions
) {
  // Variables
  const accountName = Environment(env).AZURE_STORAGE_ACCOUNT;
  const accountKey = Environment(env).AZURE_STORAGE_KEY;
  const containerName = Environment(env).AZURE_STORAGE_CONTAINER;
  const bucketName = getBucketName(containerName);
  const fullPath = getObjectFullPath(filePath, containerName);
  const url = `https://${accountName}.blob.core.windows.net/${bucketName}/${fullPath}`;
  const jsonData = JSON.stringify(logObject);
  const requestDate = new Date().toUTCString();
  const storageServiceVersion = '2022-11-02';
  const contentLength = Buffer.byteLength(jsonData);
  const accessToken = await getAzureAccessToken({
    scope: `https://${accountName}.blob.core.windows.net/.default`,
    resource: 'https://storage.azure.com/',
    env,
  });
  let authorization;
  if (!accessToken) {
    // Construct the canonicalized headers and resource
    const canonicalizedHeaders = `x-ms-blob-type:BlockBlob\nx-ms-date:${requestDate}\nx-ms-version:${storageServiceVersion}`;
    const canonicalizedResource = `/${accountName}/${bucketName}/${fullPath}`;

    // Construct the string to sign
    const stringToSign = `PUT\n\n\n${contentLength}\n\napplication/json\n\n\n\n\n\n\n${canonicalizedHeaders}\n${canonicalizedResource}`;

    // Create the signature
    const decodedKey = Buffer.from(accountKey, 'base64');
    //   const signature = '';
    const signature = createHmac('sha256', decodedKey)
      .update(stringToSign, 'utf8')
      .digest('base64');

    // Construct the authorization header
    authorization = `SharedKey ${accountName}:${signature}`;
  } else {
    authorization = `Bearer ${accessToken}`;
  }
  // Options for the HTTPS request
  const options = {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-date': requestDate,
      'x-ms-version': storageServiceVersion,
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
      message: `AZURE_INSERT_ERROR: ${JSON.stringify({
        errorMessage,
        ...apmOptions,
      })}`,
    });
  }
}

export async function getLogsFromAzureStorage(
  env: Record<string, any>,
  filePath: string
) {
  const accountName = Environment(env).AZURE_STORAGE_ACCOUNT;
  const containerName = Environment(env).AZURE_STORAGE_CONTAINER;

  const bucketName = getBucketName(containerName);
  const fullPath = getObjectFullPath(filePath, containerName);
  const url = `https://${accountName}.blob.core.windows.net/${bucketName}/${fullPath}`;
  const requestDate = new Date().toUTCString();
  const storageServiceVersion = '2022-11-02';
  const accessToken = await getAzureAccessToken({
    scope: `https://${accountName}.blob.core.windows.net/.default`,
    resource: 'https://storage.azure.com/',
    env,
  });
  let authorization;
  if (!accessToken) {
    // Variables
    const accountKey = Environment(env).AZURE_STORAGE_KEY;

    // Construct the canonicalized headers and resource
    const canonicalizedHeaders = `x-ms-date:${requestDate}\nx-ms-version:${storageServiceVersion}`;
    const canonicalizedResource = `/${accountName}/${bucketName}/${fullPath}`;

    // Construct the string to sign
    const stringToSign = [
      'GET', // HTTP Verb
      '', // Content-Encoding (empty since not used)
      '', // Content-Language (empty since not used)
      '', // Content-Length (empty since not used)
      '', // Content-MD5 (empty since not used)
      '', // Content-Type (empty since not used)
      '', // Date (empty since using x-ms-date)
      '', // If-Modified-Since (empty since not used)
      '', // If-Match (empty since not used)
      '', // If-None-Match (empty since not used)
      '', // If-Unmodified-Since (empty since not used)
      '', // Range (empty since not used)
      canonicalizedHeaders,
      canonicalizedResource,
    ].join('\n');
    // Create the signature
    const decodedKey = Buffer.from(accountKey, 'base64');
    const signature = createHmac('sha256', decodedKey)
      .update(stringToSign, 'utf8')
      .digest('base64');

    // Construct the authorization header
    authorization = `SharedKey ${accountName}:${signature}`;
  } else {
    authorization = `Bearer ${accessToken}`;
  }

  const options = {
    method: 'GET',
    headers: {
      'x-ms-date': requestDate,
      'x-ms-version': storageServiceVersion,
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
      message: `AZURE_GET_ERROR: ${errorMessage}`,
    });
  }

  return data;
}

export async function getAzureAccessToken({
  resource,
  scope,
  env,
}: {
  resource: string;
  scope: string;
  env: Record<string, any>;
}) {
  const {
    AZURE_AUTH_MODE: azureAuthMode,
    AZURE_ENTRA_CLIENT_ID: clientId,
    AZURE_ENTRA_CLIENT_SECRET: clientSecret,
    AZURE_ENTRA_TENANT_ID: tenantId,
    AZURE_MANAGED_CLIENT_ID: userAssignedClientId,
  } = Environment(env);
  if (azureAuthMode === 'entra') {
    if (!tenantId || !clientSecret || !clientId) {
      throw new Error('Missing Azure Entra Parameters');
    }
    //TODO: cache it
    return getAccessTokenFromEntraId(
      tenantId,
      clientId,
      clientSecret,
      scope,
      env
    );
  } else if (azureAuthMode === 'managed') {
    //TODO: cache it
    return getAzureManagedIdentityToken(resource, userAssignedClientId, env);
  }
}
