import { ProviderAPIConfig } from '../types';

const CohereAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.cohere.ai',
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
        return '/v2/chat';
      case 'complete':
        return '/v1/generate';
      case 'embed':
        return '/v2/embed';
      case 'uploadFile':
        return `/v1/datasets?name=portkey-${crypto.randomUUID()}&type=embed-input&keep_fields=custom_id,id`;
      case 'listFiles':
        return '/v1/datasets';
      case 'retrieveFile':
        return `/v1/datasets/${gatewayRequestURL.split('/').pop()}`;
      case 'deleteFile':
        return `/v1/datasets/${gatewayRequestURL.split('/').pop()}`;
      case 'createBatch':
        return '/v1/embed-jobs';
      case 'listBatches':
        return '/v1/embed-jobs';
      case 'retrieveBatch':
        return `/v1/embed-jobs/${gatewayRequestURL.split('/').pop()}`;
      case 'cancelBatch':
        return `/v1/embed-jobs/${gatewayRequestURL.split('batches/').pop()}`;
      default:
        return '';
    }
  },
};

export default CohereAPIConfig;
