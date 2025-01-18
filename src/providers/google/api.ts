import { ProviderAPIConfig } from '../types';

export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://generativelanguage.googleapis.com',
  headers: () => {
    return { 'Content-Type': 'application/json' };
  },
  getEndpoint: ({ fn, providerOptions, gatewayRequestBodyJSON }) => {
    let routeVersion = 'v1beta';
    let mappedFn = fn;
    const { model, stream } = gatewayRequestBodyJSON;
    if (model?.includes('gemini-2.0-flash-thinking-exp')) {
      routeVersion = 'v1alpha';
    }
    const { apiKey } = providerOptions;
    if (stream && fn === 'chatComplete') {
      return `/${routeVersion}/models/${model}:streamGenerateContent?key=${apiKey}`;
    }
    switch (mappedFn) {
      case 'chatComplete': {
        return `/${routeVersion}/models/${model}:generateContent?key=${apiKey}`;
      }
      case 'embed': {
        return `/${routeVersion}/models/${model}:embedContent?key=${apiKey}`;
      }
      default:
        return '';
    }
  },
};

export default GoogleApiConfig;
