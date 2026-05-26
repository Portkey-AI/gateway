import { ProviderAPIConfig } from '../types';
import { assertSafeUrlComponent } from '../utils/urlValidation';

const CortexAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const snowflakeAccount = (providerOptions as any).snowflakeAccount;
    assertSafeUrlComponent('snowflake account', snowflakeAccount);
    return `https://${snowflakeAccount}.snowflakecomputing.com/api/v2`;
  },
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
