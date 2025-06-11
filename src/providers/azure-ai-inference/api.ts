import { GITHUB } from '../../globals';
import {
  getAccessTokenFromEntraId,
  getAzureManagedIdentityToken,
} from '../azure-openai/utils';
import { ProviderAPIConfig } from '../types';

const AzureAIInferenceAPI: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { provider, azureFoundryUrl } = providerOptions;
    if (provider === GITHUB) {
      return 'https://models.inference.ai.azure.com';
    }
    if (azureFoundryUrl) {
      return azureFoundryUrl;
    }

    return '';
  },
  headers: async ({ providerOptions }) => {
    const {
      apiKey,
      azureExtraParams,
      azureDeploymentName,
      azureAdToken,
      azureAuthMode,
    } = providerOptions;

    const headers: Record<string, string> = {
      'extra-parameters': azureExtraParams ?? 'drop',
      ...(azureDeploymentName && {
        'azureml-model-deployment': azureDeploymentName,
      }),
    };
    if (azureAdToken) {
      headers['Authorization'] =
        `Bearer ${azureAdToken?.replace('Bearer ', '')}`;
      return headers;
    }

    if (azureAuthMode === 'entra') {
      const { azureEntraTenantId, azureEntraClientId, azureEntraClientSecret } =
        providerOptions;
      if (azureEntraTenantId && azureEntraClientId && azureEntraClientSecret) {
        const scope = 'https://cognitiveservices.azure.com/.default';
        const accessToken = await getAccessTokenFromEntraId(
          azureEntraTenantId,
          azureEntraClientId,
          azureEntraClientSecret,
          scope
        );
        headers['Authorization'] = `Bearer ${accessToken}`;
        return headers;
      }
    }
    if (azureAuthMode === 'managed') {
      const { azureManagedClientId } = providerOptions;
      const resource = 'https://cognitiveservices.azure.com/';
      const accessToken = await getAzureManagedIdentityToken(
        resource,
        azureManagedClientId
      );
      headers['Authorization'] = `Bearer ${accessToken}`;
      return headers;
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      return headers;
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

    const apiVersion = azureApiVersion ? `?api-version=${azureApiVersion}` : '';
    switch (mappedFn) {
      case 'complete': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}${apiVersion}`;
      }
      case 'chatComplete': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}${apiVersion}`;
      }
      case 'embed': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}${apiVersion}`;
      }
      default:
        return '';
    }
  },
};

export default AzureAIInferenceAPI;
