import { logger } from '../apm';
import { externalServiceFetch } from './fetch';
import { Environment } from './env';

export async function fetchEntraIdToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string
): Promise<string | undefined> {
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
      logger.error({ message: `Error from Entra: ${errorMessage}` });
      return undefined;
    }

    const data: { access_token: string } = await response.json();
    return data.access_token;
  } catch (error: any) {
    logger.error({
      message: `Entra ID Token Generation Error: ${error.message}`,
    });
    return undefined;
  }
}

export async function fetchManagedIdentityToken(
  resource: string,
  clientId?: string
): Promise<string | undefined> {
  try {
    const {
      AZURE_IDENTITY_ENDPOINT: identityEndpoint,
      AZURE_MANAGED_VERSION: version,
      AZURE_MANAGED_IDENTITY_HEADER: identityHeader,
    } = Environment({});

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
      logger.error({ message: `Error from Managed Identity: ${errorMessage}` });
      return undefined;
    }

    const data: { access_token: string } = await response.json();
    return data.access_token;
  } catch (error: any) {
    logger.error({
      message: `Managed Identity Token Generation Error: ${error.message}`,
    });
    return undefined;
  }
}

export async function fetchAzureWorkloadIdentityToken(
  authorityHost: string,
  scope = 'https://cognitiveservices.azure.com/.default',
  tenantId: string,
  clientId: string,
  federatedToken: string,
  env?: Record<string, any>
) {
  try {
    const url = `${authorityHost}/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_assertion: federatedToken,
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
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
    return data.access_token;
  } catch (error: any) {
    logger.error({
      message: `Workload Identity Token Generation Error: ${error.message}`,
    });
  }
  return undefined;
}
