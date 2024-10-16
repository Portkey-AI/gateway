import { GITHUB } from '../../globals';
import { getAccessTokenFromEntraId } from '../azure-openai/utils';
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
    if (provider === GITHUB) {
      return 'https://models.inference.ai.azure.com';
    }
    if (azureDeploymentType === 'serverless') {
      return `https://${azureDeploymentName?.toLowerCase()}.${azureRegion}.models.ai.azure.com`;
    }

    return `https://${azureEndpointName}.${azureRegion}.inference.ml.azure.com/score`;
  },
  headers: async ({ providerOptions }) => {
    const {
      apiKey,
      azureDeploymentType,
      azureDeploymentName,
      azureEntraClientId,
      azureEntraClientSecret,
      azureEntraTenantId,
    } = providerOptions;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'extra-parameters': 'ignore',
    };
    if (azureDeploymentType === 'managed' && azureDeploymentName) {
      headers['azureml-model-deployment'] = azureDeploymentName;
    }
    if (azureEntraClientId && azureEntraClientSecret && azureEntraTenantId) {
      const accessToken = await getAccessTokenFromEntraId(
        azureEntraTenantId,
        azureEntraClientId,
        azureEntraClientSecret,
        'https://cognitiveservices.azure.com/decision/.default'
      );
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  },
  getEndpoint: ({ providerOptions, fn }) => {
    const { azureApiVersion, urlToFetch } = providerOptions;
    let mappedFn = fn;

    const ENDPOINT_MAPPING: Record<string, string> = {
      complete: '/completions',
      chatComplete: '/chat/completions',
      embed: '/embeddings',
    };

    const isGithub = providerOptions.provider === GITHUB;

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
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?api-version=${azureApiVersion}`;
      }
      case 'chatComplete': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?api-version=${azureApiVersion}`;
      }
      case 'embed': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?api-version=${azureApiVersion}`;
      }
      default:
        return '';
    }
  },
};

export default AzureAIInferenceAPI;
