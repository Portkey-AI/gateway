import { endpointStrings, ProviderAPIConfig } from '../types';

export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://generativelanguage.googleapis.com',
  headers: () => {
    return { 'Content-Type': 'application/json' };
  },
  getEndpoint: ({
    fn,
    providerOptions,
    gatewayRequestBodyJSON: gatewayRequestBody,
  }) => {
    let routeVersion = 'v1beta';
    let mappedFn = fn;
    const { model, stream } = gatewayRequestBody;
    if (model?.includes('gemini-2.0-flash-thinking-exp')) {
      routeVersion = 'v1alpha';
    }
    const { apiKey } = providerOptions;
    if (stream) {
      mappedFn = `stream-${fn}` as endpointStrings;
    }
    switch (mappedFn) {
      case 'chatComplete': {
        return `/${routeVersion}/models/${model}:generateContent?key=${apiKey}`;
      }
      case 'stream-chatComplete': {
        return `/${routeVersion}/models/${model}:streamGenerateContent?key=${apiKey}`;
      }
      case 'embed': {
        return `/${routeVersion}/models/${model}:embedContent?key=${apiKey}`;
      }
      default:
        return '';
    }
  },
  getProxyEndpoint: ({
    reqPath,
    reqQuery,
    providerOptions,
    requestHeaders,
  }) => {
    const { apiKey } = providerOptions;
    const queryParams = new URLSearchParams();

    if (apiKey) {
      queryParams.set('key', apiKey);
    }
    // Add API key to query parameters for proxy/pass-through requests
    if (!reqQuery) {
      return `${reqPath}?${queryParams.toString()}`;
    }
    if (!reqQuery.includes('key=')) {
      return `${reqPath}${reqQuery}&${queryParams.toString()}`;
    }
    return `${reqPath}${reqQuery}`;
  },
};

export default GoogleApiConfig;
