import { Options } from '../../types/requestBody';
import { ProviderAPIConfig } from '../types';

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { resourceName, deploymentId } = providerOptions;
    return `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentId}`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return { 'api-key': `${apiKey}` };
  },
  getEndpoint: ({ providerOptions, fn }) => {
    const { apiVersion, urlToFetch } = providerOptions;
    let mappedFn = fn;
    if (
      fn === 'proxy' &&
      urlToFetch &&
      urlToFetch?.indexOf('/chat/completions') > -1
    ) {
      mappedFn = 'chatComplete';
    } else if (
      fn === 'proxy' &&
      urlToFetch &&
      urlToFetch?.indexOf('/completions') > -1
    ) {
      mappedFn = 'complete';
    } else if (
      fn === 'proxy' &&
      urlToFetch &&
      urlToFetch?.indexOf('/embeddings') > -1
    ) {
      mappedFn = 'embed';
    }

    switch (mappedFn) {
      case 'complete': {
        return `/completions?api-version=${apiVersion}`;
      }
      case 'chatComplete': {
        return `/chat/completions?api-version=${apiVersion}`;
      }
      case 'embed': {
        return `/embeddings?api-version=${apiVersion}`;
      }
      default:
        return '';
    }
  },
};

export default AzureOpenAIAPIConfig;
