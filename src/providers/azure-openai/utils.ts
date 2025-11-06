import { Context } from 'hono';
import { logger } from '../../apm';
import { AZURE_OPEN_AI } from '../../globals';
import { getFromKV, putInKV } from '../../services/kvstore';
import { Environment } from '../../utils/env';
import { externalServiceFetch } from '../../utils/fetch';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';

const CACHE_EXPIRY = 15 * 60; // 15 minutes

export async function getAccessTokenFromEntraId(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope = 'https://openai.azure.com/.default'
) {
  const cacheKey = `azure-entra-token-${tenantId}-${clientId}-${clientSecret}-${scope}`;
  const cachedToken = await getFromKV(cacheKey, true);
  if (cachedToken) {
    return cachedToken;
  }
  try {
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: scope,
      grant_type: 'client_credentials',
    });

    const response = await externalServiceFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorMessage = await response.text();
      logger.error({ message: `Error from Entra ${errorMessage}` });
      return undefined;
    }
    const data: { access_token: string } = await response.json();
    await putInKV(cacheKey, data.access_token, CACHE_EXPIRY);
    return data.access_token;
  } catch (error: any) {
    logger.error({
      message: `Entra ID Token Generation Error: ${error.message}`,
    });
  }
}

export async function getAzureManagedIdentityToken(
  c: Context,
  resource: string,
  clientId?: string
) {
  const cacheKey = `azure-managed-identity-token-${resource}-${clientId ?? ''}`;
  const cachedToken = await getFromKV(cacheKey, true);
  if (cachedToken) {
    return cachedToken;
  }
  try {
    const {
      AZURE_IDENTITY_ENDPOINT: identityEndpoint,
      AZURE_MANAGED_VERSION: version,
      AZURE_MANAGED_IDENTITY_HEADER: identityHeader,
    } = Environment(c);
    const finalIMDSEndpoint = identityEndpoint
      ? identityEndpoint
      : 'http://169.254.169.254/metadata/identity/oauth2/token';
    const finalVersion = version || '2018-02-01';
    const headers: Record<string, string> = {};
    if (identityHeader) {
      headers['X-IDENTITY-HEADER'] = identityHeader;
    } else {
      headers['Metadata'] = 'true';
    }
    const response = await externalServiceFetch(
      `${finalIMDSEndpoint}?api-version=${finalVersion}&resource=${encodeURIComponent(resource)}${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''}`,
      {
        method: 'GET',
        headers,
      }
    );
    if (!response.ok) {
      const errorMessage = await response.text();
      logger.error({ message: `Error from Managed ${errorMessage}` });
      return undefined;
    }
    const data: { access_token: string } = await response.json();
    await putInKV(cacheKey, data.access_token, CACHE_EXPIRY);
    return data.access_token;
  } catch (error: any) {
    logger.error({
      message: `Managed Identity Token Generation Error: ${error.message}`,
    });
  }
}

export const AzureOpenAIFinetuneResponseTransform = (
  response: Response | ErrorResponse,
  responseStatus: number
): Response | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_OPEN_AI);
  }

  const _response = { ...response } as any;

  if (['created', 'pending'].includes(_response.status)) {
    _response.status = 'queued';
  }

  return _response;
};
