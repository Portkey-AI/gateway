import { ProviderAPIConfig } from '../types';
import { assertSafeUrlComponent } from '../utils/urlValidation';

const WorkersAiAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { workersAiAccountId } = providerOptions;
    assertSafeUrlComponent('workers ai account id', workersAiAccountId);
    return `https://api.cloudflare.com/client/v4/accounts/${workersAiAccountId}/ai/run`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON: params }) => {
    const { model } = params;
    switch (fn) {
      case 'complete': {
        return `/${model}`;
      }
      case 'chatComplete': {
        return `/${model}`;
      }
      case 'embed': {
        return `/${model}`;
      }
      case 'imageGenerate': {
        return `/${model}`;
      }
      default:
        return '';
    }
  },
};

export default WorkersAiAPIConfig;
