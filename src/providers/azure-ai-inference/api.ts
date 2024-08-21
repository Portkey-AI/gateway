import { Options } from '../../types/requestBody';
import { ProviderAPIConfig } from '../types';

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { azureDeploymentName, azureRegion, azureDeploymentType } =
      providerOptions;
    return `https://${azureDeploymentName}-${azureDeploymentType === 'serverless' ? 'serverless' : ''}.${azureRegion}.inference.ai.azure.com`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return {
      Authorization: `Bearer ${apiKey}`,
      'extra-parameters': 'ignore',
    };
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
      default:
        return '';
    }
  },
};

export default AzureOpenAIAPIConfig;
