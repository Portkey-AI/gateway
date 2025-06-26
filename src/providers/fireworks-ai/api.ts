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
  getEndpoint: ({
    fn,
    gatewayRequestBodyJSON: gatewayRequestBody,
    c,
    gatewayRequestURL,
  }) => {
    const model = gatewayRequestBody?.model;

    const jobIdIndex = ['cancelFinetune'].includes(fn ?? '') ? -2 : -1;
    const jobId = gatewayRequestURL.split('/').at(jobIdIndex);

    const url = new URL(gatewayRequestURL);
    const params = url.searchParams;

    const size = params.get('limit') ?? 50;
    const page = params.get('after') ?? '1';

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
        return '';
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
        return `/supervisedFineTuningJobs`;
      case 'retrieveFinetune':
        return `/supervisedFineTuningJobs/${jobId}`;
      case 'listFinetunes':
        return `/supervisedFineTuningJobs?pageToken=${page}&pageSize=${size}`;
      case 'cancelFinetune':
        return `/supervisedFineTuningJobs/${jobId}`;
      default:
        return '';
    }
  },
};

export default FireworksAIAPIConfig;
