import { AZURE_OPEN_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';

export async function getAccessTokenFromEntraId(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope = 'https://cognitiveservices.azure.com/.default'
) {
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
      console.log({ message: `Error from Entra ${errorMessage}` });
      return undefined;
    }
    const data: { access_token: string } = await response.json();
    return data.access_token;
  } catch (error) {
    console.log(error);
  }
}

export async function getAzureManagedIdentityToken(
  resource: string,
  clientId?: string
) {
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
      console.log({ message: `Error from Managed ${errorMessage}` });
      return undefined;
    }
    const data: { access_token: string } = await response.json();
    return data.access_token;
  } catch (error) {
    console.log({ error });
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
