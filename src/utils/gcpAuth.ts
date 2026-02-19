import { logger } from '../apm';
import { externalServiceFetch } from './fetch';

export interface GCPCredentials {
  access_token: string;
  expires_in: number;
}

export async function fetchWorkloadIdentityToken(): Promise<
  GCPCredentials | undefined
> {
  const METADATA_TOKEN_ENDPOINT =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  try {
    const response = await externalServiceFetch(METADATA_TOKEN_ENDPOINT, {
      method: 'GET',
      headers: {
        'Metadata-Flavor': 'Google',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({
        message: 'Error from Workload Identity Federation',
        status: response.status,
        response: errorBody,
      });
      return undefined;
    }

    const data: {
      access_token: string;
      expires_in: number;
    } = await response.json();

    return data;
  } catch (err: unknown) {
    logger.error({
      message: 'Workload Identity Token Generation Error',
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
