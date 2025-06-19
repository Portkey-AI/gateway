import { GITHUB } from '../../globals';
import {
  getAccessTokenFromEntraId,
  getAzureManagedIdentityToken,
} from '../azure-openai/utils';
import { ProviderAPIConfig } from '../types';

const NON_INFERENCE_ENDPOINTS = [
  'createBatch',
  'retrieveBatch',
  'cancelBatch',
  'getBatchOutput',
  'listBatches',
  'uploadFile',
  'listFiles',
  'retrieveFile',
  'deleteFile',
  'retrieveFileContent',
];

const AzureAIInferenceAPI: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    const { provider, azureFoundryUrl } = providerOptions;

    // Azure Foundry URL includes `/deployments/<deployment>`, strip out and append openai for batches/finetunes
    if (fn && NON_INFERENCE_ENDPOINTS.includes(fn)) {
      return new URL(azureFoundryUrl ?? '').origin + '/openai';
    }

    if (provider === GITHUB) {
      return 'https://models.inference.ai.azure.com';
    }
    if (azureFoundryUrl) {
      return azureFoundryUrl;
    }

    return '';
  },
  headers: async ({ providerOptions, fn }) => {
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
      ...(['createTranscription', 'createTranslation', 'uploadFile'].includes(
        fn
      )
        ? {
            'Content-Type': 'multipart/form-data',
          }
        : {}),
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
  getEndpoint: ({ providerOptions, fn, gatewayRequestURL }) => {
    const { azureApiVersion, urlToFetch } = providerOptions;
    let mappedFn = fn;

    const urlObj = new URL(gatewayRequestURL);
    const path = urlObj.pathname.replace('/v1', '');
    const searchParams = urlObj.searchParams;

    if (azureApiVersion) {
      searchParams.set('api-version', azureApiVersion);
    }

    const ENDPOINT_MAPPING: Record<string, string> = {
      complete: '/completions',
      chatComplete: '/chat/completions',
      embed: '/embeddings',
      realtime: '/realtime',
      imageGenerate: '/images/generations',
      createSpeech: '/audio/speech',
      createTranscription: '/audio/transcriptions',
      createTranslation: '/audio/translations',
      uploadFile: path,
      retrieveFile: path,
      listFiles: path,
      deleteFile: path,
      retrieveFileContent: path,
      listBatches: path,
      retrieveBatch: path,
      cancelBatch: path,
      getBatchOutput: path,
      createBatch: path,
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

    const searchParamsString = searchParams.toString();
    switch (mappedFn) {
      case 'complete': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?${searchParamsString}`;
      }
      case 'chatComplete': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?${searchParamsString}`;
      }
      case 'embed': {
        return isGithub
          ? ENDPOINT_MAPPING[mappedFn]
          : `${ENDPOINT_MAPPING[mappedFn]}?${searchParamsString}`;
      }
      case 'realtime':
      case 'imageGenerate':
      case 'createSpeech':
      case 'createTranscription':
      case 'createTranslation':
      case 'cancelBatch':
      case 'createBatch':
      case 'getBatchOutput':
      case 'retrieveBatch':
      case 'listBatches':
      case 'retrieveFile':
      case 'listFiles':
      case 'deleteFile':
      case 'retrieveFileContent': {
        return `${ENDPOINT_MAPPING[mappedFn]}?${searchParamsString}`;
      }

      default:
        return '';
    }
  },
};

export default AzureAIInferenceAPI;
