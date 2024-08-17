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

    if (fn === 'proxy' && urlToFetch) {
      if (urlToFetch?.indexOf('/chat/completions') > -1) {
        mappedFn = 'chatComplete';
      } else if (urlToFetch?.indexOf('/completions') > -1) {
        mappedFn = 'complete';
      } else if (urlToFetch?.indexOf('/embeddings') > -1) {
        mappedFn = 'embed';
      } else if (urlToFetch?.indexOf('/images/generations') > -1) {
        mappedFn = 'imageGenerate';
      }
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
      case 'imageGenerate': {
        return `/images/generations?api-version=${apiVersion}`;
      }
      default:
        return '';
    }
  },
};

export default AzureOpenAIAPIConfig;
