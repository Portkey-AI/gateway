import { ProviderAPIConfig } from '../types';
import { OCIRequestSigner } from './utils';

const OracleAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    // Oracle Generative AI Inference API base URL
    return `https://inference.generativeai.${providerOptions.oracleRegion}.oci.oraclecloud.com`;
  },
  headers: async ({
    providerOptions,
    transformedRequestUrl,
    transformedRequestBody,
  }) => {
    const signer = new OCIRequestSigner({
      tenancy: providerOptions.oracleTenancy || '',
      user: providerOptions.oracleUser || '',
      fingerprint: providerOptions.oracleFingerprint || '',
      privateKey: providerOptions.oraclePrivateKey || '',
      keyPassphrase: providerOptions.oracleKeyPassphrase,
      region: providerOptions.oracleRegion || '',
    });

    const headers = await signer.signRequest(
      'POST',
      transformedRequestUrl,
      JSON.stringify(transformedRequestBody),
      {}
    );

    return headers;
  },
  getEndpoint: ({ fn, providerOptions }) => {
    const { oracleApiVersion = '20231130' } = providerOptions;
    let endpoint = null;
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        endpoint = '/actions/chat';
        break;
      default:
        return '';
    }
    return `/${oracleApiVersion}${endpoint}`;
  },
};

export default OracleAPIConfig;
