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
  getEndpoint: ({ fn, gatewayRequestBody, requestURL }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat';
      case 'complete':
        return '/generate';
      case 'embed':
        return '/embed';
      case 'uploadFile':
        if (gatewayRequestBody && gatewayRequestBody instanceof FormData) {
          const url = new URL(requestURL);
          const fileName =
            url.searchParams.get('name') ||
            // @ts-ignore (Hono type is incorrect)
            gatewayRequestBody.get('file')?.name;
          const purpose =
            url.searchParams.get('type') || gatewayRequestBody.get('purpose');
          const searchParams = Array.from(url.searchParams.entries())
            .filter(([key]) => key !== 'name' && key !== 'type')
            .map(([key, value]) => `${key}=${value}`)
            .join('&');

          return `/datasets?name=${fileName}&type=${purpose}${searchParams.length > 0 ? `&${searchParams}` : ''}`;
        }
        throw new GatewayError('File upload requires a file and purpose');
      case 'listFiles':
        return '/datasets';
      case 'retrieveFile':
        return `/datasets/${requestURL.split('/').pop()}`;
      case 'deleteFile':
        return `/datasets/${requestURL.split('/').pop()}`;
      case 'createBatch':
        return '/embed-jobs';
      case 'listBatch':
        return '/embed-jobs';
      case 'retrieveBatch':
        return `/embed-jobs/${requestURL.split('/').pop()}`;
      case 'cancelBatch':
        return `/embed-jobs/${requestURL.split('batches/').pop()}`;
      default:
        return '';
    }
  },
};

export default CohereAPIConfig;
