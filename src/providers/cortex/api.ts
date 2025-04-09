import { ProviderAPIConfig } from '../types';

const CortexAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    `https://${(providerOptions as any).snowflakeAccount}.snowflakecomputing.com/api/v2`,
  headers: ({ providerOptions }) => ({
    'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
    Authorization: `Bearer ${providerOptions.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/cortex/inference:complete';
      default:
        return '';
    }
  },
};

export default CortexAPIConfig;
