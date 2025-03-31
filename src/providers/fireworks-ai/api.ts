import { ProviderAPIConfig } from '../types';

const inferenceFunctions = [
  'complete',
  'chatComplete',
  'embed',
  'imageGenerate',
];

const FireworksAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ fn, providerOptions }) => {
    if (inferenceFunctions.includes(fn ?? '')) {
      return 'https://api.fireworks.ai/inference/v1';
    }
    const accountId = providerOptions.fireworksAccountId;
    return `https://api.fireworks.ai/v1/accounts/${accountId}`;
  },
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      Accept: 'application/json',
    };
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON: gatewayRequestBody, c }) => {
    const model = gatewayRequestBody?.model;
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return `/image_generation/${model}`;
      case 'uploadFile':
        return `/datasets`;
      case 'retrieveFile': {
        const datasetId = c.req.param('id');
        return `/datasets/${datasetId}`;
      }
      case 'listFiles':
        return `/datasets`;
      case 'deleteFile': {
        const datasetId = c.req.param('id');
        return `/datasets/${datasetId}`;
      }
      case 'createFinetune':
        return `/fineTuningJobs`;
      case 'retrieveFinetune':
        return `/fineTuningJobs/${c.req.param('jobId')}`;
      case 'listFinetunes':
        return `/fineTuningJobs`;
      case 'cancelFinetune':
        return `/fineTuningJobs/${c.req.param('jobId')}`;
      default:
        return '';
    }
  },
};

export default FireworksAIAPIConfig;
