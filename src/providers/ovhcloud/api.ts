import { ProviderAPIConfig } from '../types';

const DEFAULT_OVHCLOUD_BASE_URL =
  'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1';

const OVHcloudAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_OVHCLOUD_BASE_URL,
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default OVHcloudAPIConfig;
