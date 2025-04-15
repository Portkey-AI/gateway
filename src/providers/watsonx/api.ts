import { ProviderAPIConfig } from '../types';
import axios from 'axios';

const WXApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://us-south.ml.cloud.ibm.com',
  headers: async ({ providerOptions, fn, gatewayRequestBody }) => {
    // IBM Cloud API Key must be exchanged for an access token and then added to each request
    /*
    curl -X POST 'https://iam.cloud.ibm.com/identity/token' -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=MY_APIKEY'
    {
    "access_token": "eyJhbGciOiJIUz......sgrKIi8hdFs",
    "refresh_token": "not_supported",
    "ims_user_id": 118...90,
    "token_type": "Bearer",
    "expires_in": 3600,
    "expiration": 1473188353,
    "scope": "ibm openid"
    }
    */

    const tokenRsp = await axios.post(
      'https://iam.cloud.ibm.com/identity/token',
      {
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: providerOptions.apiKey,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = tokenRsp.data;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${access_token}`,
    };

    // Accept anthropic_beta and anthropic_version in body to support enviroments which cannot send it in headers.
    const betaHeader =
      providerOptions?.['anthropicBeta'] ??
      gatewayRequestBody?.['anthropic_beta'] ??
      'messages-2023-12-15';
    const version =
      providerOptions?.['anthropicVersion'] ??
      gatewayRequestBody?.['anthropic_version'] ??
      '2023-06-01';

    if (fn === 'chatComplete') {
      headers['anthropic-beta'] = betaHeader;
    }
    headers['anthropic-version'] = version;
    return headers;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/complete';
      case 'chatComplete':
        return '/messages';
      default:
        return '';
    }
  },
};

export default WXApiConfig;
