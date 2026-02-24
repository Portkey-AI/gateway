import { AZURE_OPEN_AI } from '../../globals';
import { requestCache } from '../../services/cache/cacheService';
import { Options, Params } from '../../types/requestBody';
import {
  fetchEntraIdToken,
  fetchManagedIdentityToken,
  fetchAzureWorkloadIdentityToken,
} from '../../utils/azureAuth';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';

const CACHE_EXPIRY = 15 * 60; // 15 minutes

export async function getAccessTokenFromEntraId(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope = 'https://openai.azure.com/.default',
  env: Record<string, any>
) {
  const cache = requestCache(env);
  const cacheKey = `azure-entra-token-object-${tenantId}-${clientId}-${clientSecret}-${scope}`;
  const cachedToken = await cache.get<{ access_token: string }>(cacheKey, {
    useLocalCache: true,
  });
  if (cachedToken?.access_token) {
    return cachedToken.access_token;
  }

  const token = await fetchEntraIdToken(
    tenantId,
    clientId,
    clientSecret,
    scope
  );
  if (token) {
    await cache.set(cacheKey, { access_token: token }, { ttl: CACHE_EXPIRY });
  }
  return token;
}

export async function getAzureManagedIdentityToken(
  resource: string,
  clientId?: string,
  env?: Record<string, any>
) {
  const cache = requestCache(env);
  const cacheKey = `azure-managed-identity-token-object-${resource}-${clientId ?? ''}`;
  const cachedToken = await cache.get<{ access_token: string }>(cacheKey, {
    useLocalCache: true,
  });
  if (cachedToken?.access_token) {
    return cachedToken.access_token;
  }

  const token = await fetchManagedIdentityToken(resource, clientId);
  if (token) {
    await cache.set(cacheKey, { access_token: token }, { ttl: CACHE_EXPIRY });
  }
  return token;
}

export async function getAzureWorkloadIdentityToken(
  authorityHost: string,
  tenantId: string,
  clientId: string,
  federatedToken: string,
  scope = 'https://cognitiveservices.azure.com/.default',
  env?: Record<string, any>
) {
  const cache = requestCache(env);
  const cacheKey = `azure-workload-identity-token-object-${authorityHost}-${tenantId}-${clientId}-${federatedToken}-${scope}`;
  const cachedToken = await cache.get<{ access_token: string }>(cacheKey, {
    useLocalCache: true,
  });
  if (cachedToken?.access_token) {
    return cachedToken.access_token;
  }

  const token = await fetchAzureWorkloadIdentityToken(
    authorityHost,
    tenantId,
    clientId,
    federatedToken,
    scope,
    env
  );
  if (token) {
    await cache.set(cacheKey, { access_token: token }, { ttl: CACHE_EXPIRY });
  }
  return token;
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

export const getAzureModelValue = (
  params: Params,
  providerOptions?: Options
) => {
  const { apiVersion: azureApiVersion, deploymentId: azureDeploymentName } =
    providerOptions ?? {};
  if (azureApiVersion && azureApiVersion.trim() === 'v1') {
    return azureDeploymentName;
  }
  return params.model || '';
};
