import { ProviderAPIConfig } from '../types';

const AzureAIInferenceAPI: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const {
      azureDeploymentName,
      azureRegion,
      azureDeploymentType,
      provider,
      azureEndpointName,
    } = providerOptions;
    if (provider === 'github') {
      return 'https://models.inference.ai.azure.com';
    }
    if (azureDeploymentType === 'serverless') {
      return `https://${azureDeploymentName?.toLowerCase()}.${azureRegion}.models.ai.azure.com`;
    }

    return `https://${azureEndpointName}.${azureRegion}.inference.ml.azure.com/score`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey, azureDeploymentType, azureDeploymentName } =
      providerOptions;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'extra-parameters': 'ignore',
    };
    if (azureDeploymentType === 'managed' && azureDeploymentName) {
      headers['azureml-model-deployment'] = azureDeploymentName;
    }
    return headers;
  },
  getEndpoint: ({ providerOptions, fn }) => {
    const { azureApiVersion, urlToFetch } = providerOptions;
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
        return `/completions?api-version=${azureApiVersion}`;
      }
      case 'chatComplete': {
        return `/chat/completions?api-version=${azureApiVersion}`;
      }
      case 'embed': {
        return `/embeddings?api-version=${azureApiVersion}`;
      }
      default:
        return '';
    }
  },
};

export default AzureAIInferenceAPI;
