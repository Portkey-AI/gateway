import { GatewayError } from '../../errors/GatewayError';
import { ProviderAPIConfig } from '../types';

const CohereAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.cohere.ai/v1',
  headers: ({ providerOptions, fn }) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (fn === 'uploadFile') {
      headers['Content-Type'] = 'multipart/form-data';
    }
    return headers;
  },
  getEndpoint: ({ fn, gatewayRequestBody, requestPath }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat';
      case 'complete':
        return '/generate';
      case 'embed':
        return '/embed';
      case 'uploadFile':
        if (gatewayRequestBody && gatewayRequestBody instanceof FormData) {
          // @ts-ignore (Hono type is incorrect)
          const fileName = gatewayRequestBody.get('file')?.name;
          const purpose = gatewayRequestBody.get('purpose');
          return `/datasets?name=${fileName}&type=${purpose}`;
        }
        throw new GatewayError('File upload requires a file and purpose');
      case 'getFiles':
        return '/datasets';
      case 'getFile':
        return `/datasets/${requestPath.split('/').pop()}`;
      case 'deleteFile':
        return `/datasets/${requestPath.split('/').pop()}`;
      default:
        return '';
    }
  },
};

export default CohereAPIConfig;
