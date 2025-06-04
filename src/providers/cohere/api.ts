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
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat';
      case 'complete':
        return '/generate';
      case 'embed':
        return '/embed';
      case 'uploadFile':
        return `/datasets?name=portkey-${crypto.randomUUID()}&type=embed-input&keep_fields=custom_id,id`;
      case 'listFiles':
        return '/datasets';
      case 'retrieveFile':
        return `/datasets/${gatewayRequestURL.split('/').pop()}`;
      case 'deleteFile':
        return `/datasets/${gatewayRequestURL.split('/').pop()}`;
      case 'createBatch':
        return '/embed-jobs';
      case 'listBatches':
        return '/embed-jobs';
      case 'retrieveBatch':
        return `/embed-jobs/${gatewayRequestURL.split('/').pop()}`;
      case 'cancelBatch':
        return `/embed-jobs/${gatewayRequestURL.split('batches/').pop()}`;
      default:
        return '';
    }
  },
};

export default CohereAPIConfig;
