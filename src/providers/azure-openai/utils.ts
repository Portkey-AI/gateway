export async function getAccessTokenFromEntraId(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope = 'https://openai.azure.com/.default'
) {
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
    throw new Error(`Error fetching access token: ${response.statusText}`);
  }
  const data: { access_token: string } = await response.json();
  return data.access_token;
}
