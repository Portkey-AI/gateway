import { ProviderAPIConfig } from '../types';

const CustomHostAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost || '';
  },
  headers: () => ({}),
  getEndpoint: () => '',
};

export default CustomHostAPIConfig;
