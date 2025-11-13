import { AzureCredentials } from './types';

const cacheExpiry = 15 * 60; // 15 minutes

export async function getAccessTokenFromEntraId(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope = 'https://openai.azure.com/.default',
  check: string,
  options?: Record<string, any>,
  env?: Record<string, any>
) {
  const result: { token: string; error: string | null } = {
    token: '',
    error: null,
  };
  const cacheKey = `azure-plugin-entra-token-${check}-${tenantId}-${clientId}-${clientSecret}`;
  const cachedToken = await options?.getFromCacheByKey?.(env, cacheKey);
  if (cachedToken) {
    return { token: cachedToken, error: null };
  }
  try {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope,
      grant_type: 'client_credentials',
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorMessage = await response.text();
      result.error = errorMessage;
      return result;
    }
    const data: { access_token: string } = await response.json();
    result.token = data.access_token;
    await options?.putInCacheWithValue?.(
      env,
      cacheKey,
      result.token,
      cacheExpiry
    );
  } catch (error) {
    result.error = (error as Error).message;
  }
  return result;
}

export async function getAzureManagedIdentityToken(
  resource: string,
  check: string,
  clientId?: string,
  options?: Record<string, any>,
  env?: Record<string, any>
) {
  const result: { token: string; error: string | null } = {
    token: '',
    error: null,
  };
  const cacheKey = `azure-plugin-managed-identity-token-${check}-${resource}-${clientId}`;
  const cachedToken = await options?.getFromCacheByKey?.(env, cacheKey);
  if (cachedToken) {
    return { token: cachedToken, error: null };
  }
  try {
    const response = await fetch(
      `http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=${encodeURIComponent(resource)}${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''}`,
      {
        method: 'GET',
        headers: {
          Metadata: 'true',
        },
      }
    );
    if (!response.ok) {
      const errorMessage = await response.text();
      result.error = errorMessage;
      return result;
    }
    const data: { access_token: string } = await response.json();
    result.token = data.access_token;
    await options?.putInCacheWithValue?.(
      env,
      cacheKey,
      result.token,
      cacheExpiry
    );
    return result;
  } catch (error) {
    result.error = (error as Error).message;
  }
  return result;
}

export function getAzureCliToken(
  scope = 'https://cognitiveservices.azure.com/.default',
  check: string
): { token: string; error: string | null } {
  const result: { token: string; error: string | null } = {
    token: '',
    error: null,
  };

  try {
    // Note: Azure CLI auth only works in Node.js runtime
    // This will not work in Cloudflare Workers or other edge runtimes
    if (typeof process === 'undefined' || !process.versions?.node) {
      result.error = 'Azure CLI authentication requires Node.js runtime';
      return result;
    }

    const { execSync } = require('child_process');

    // Execute Azure CLI command to get access token
    const command = `az account get-access-token --resource ${scope.replace('/.default', '')}`;
    const output = execSync(command, { encoding: 'utf-8' });

    const tokenData = JSON.parse(output);
    result.token = tokenData.accessToken;
  } catch (error: any) {
    result.error = error?.message || String(error);
    console.error('getAzureCliToken error: ', result.error);
    console.error(
      'Make sure Azure CLI is installed and you are logged in using "az login"'
    );
  }

  return result;
}

export const getAccessToken = async (
  credentials: AzureCredentials,
  check: string,
  options?: Record<string, any>,
  env?: Record<string, any>
) => {
  if (credentials.apiKey) {
    return { token: credentials.apiKey, error: null };
  }
  const scope = 'https://cognitiveservices.azure.com/.default';

  const { clientId, clientSecret, tenantId, azureAuthMode } = credentials ?? {};

  let tokenResult: { token: string; error: string | null } = {
    token: '',
    error: null,
  };
  // client id is only set for managed identity
  if (azureAuthMode === 'managed') {
    tokenResult = await getAzureManagedIdentityToken(
      credentials?.resourceName ?? '',
      check,
      clientId,
      options,
      env
    );
  }

  if (azureAuthMode === 'entra') {
    tokenResult = await getAccessTokenFromEntraId(
      tenantId ?? '',
      clientId ?? '',
      clientSecret ?? '',
      scope,
      check,
      options,
      env
    );
  }

  if (azureAuthMode === 'azure_cli') {
    tokenResult = getAzureCliToken(scope, check);
  }

  return tokenResult;
};
