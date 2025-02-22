import { ProviderAPIConfig } from '../types';
import {
  getAccessTokenFromEntraId,
  getAzureManagedIdentityToken,
} from './utils';

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { resourceName } = providerOptions;
    return `https://${resourceName}.openai.azure.com/openai`;
  },
  headers: async ({ providerOptions, fn }) => {
    const { apiKey, azureAuthMode } = providerOptions;

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
        return {
          Authorization: `Bearer ${accessToken}`,
        };
      }
    }
    if (azureAuthMode === 'managed') {
      const { azureManagedClientId } = providerOptions;
      const resource = 'https://cognitiveservices.azure.com/';
      const accessToken = await getAzureManagedIdentityToken(
        resource,
        azureManagedClientId
      );
      return {
        Authorization: `Bearer ${accessToken}`,
      };
    }
    const headersObj: Record<string, string> = {
      'api-key': `${apiKey}`,
    };
    if (
      fn === 'createTranscription' ||
      fn === 'createTranslation' ||
      fn === 'uploadFile'
    ) {
      headersObj['Content-Type'] = 'multipart/form-data';
    }
    if (providerOptions.openaiBeta) {
      headersObj['OpenAI-Beta'] = providerOptions.openaiBeta;
    }
    return headersObj;
  },
  getEndpoint: ({ providerOptions, fn, gatewayRequestURL, c }) => {
    const gatewayRequestPath = c.req.url.split('/v1')[0];
    const { apiVersion, urlToFetch, deploymentId } = providerOptions;
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
      } else if (urlToFetch?.indexOf('/audio/speech') > -1) {
        mappedFn = 'createSpeech';
      } else if (urlToFetch?.indexOf('/audio/transcriptions') > -1) {
        mappedFn = 'createTranscription';
      } else if (urlToFetch?.indexOf('/audio/translations') > -1) {
        mappedFn = 'createTranslation';
      }
    }

    const segments = gatewayRequestURL?.split('/');
    let id = '';
    if (['retrieveFileContent'].includes(mappedFn)) {
      id = segments?.at(-2) ?? '';
    } else {
      id = segments?.at(-1) ?? '';
    }
    const azureSpecificQueryParams = gatewayRequestPath.includes('?')
      ? `&${apiVersion}&deployment=${providerOptions.deploymentId}`
      : `?${apiVersion}&deployment=${providerOptions.deploymentId}`;

    switch (mappedFn) {
      case 'complete': {
        return `/deployments/${deploymentId}/completions?api-version=${apiVersion}`;
      }
      case 'chatComplete': {
        return `/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;
      }
      case 'embed': {
        return `/deployments/${deploymentId}/embeddings?api-version=${apiVersion}`;
      }
      case 'imageGenerate': {
        return `/deployments/${deploymentId}/images/generations?api-version=${apiVersion}`;
      }
      case 'createSpeech': {
        return `/deployments/${deploymentId}/audio/speech?api-version=${apiVersion}`;
      }
      case 'createTranscription': {
        return `/deployments/${deploymentId}/audio/transcriptions?api-version=${apiVersion}`;
      }
      case 'createTranslation': {
        return `/deployments/${deploymentId}/audio/translations?api-version=${apiVersion}`;
      }
      case 'realtime': {
        return `/realtime?api-version=${apiVersion}&deployment=${providerOptions.deploymentId}`;
      }
      case 'uploadFile':
        return `/files?api-version=${apiVersion}`;
      case 'retrieveFile':
        return `/files/${id}?api-version=${apiVersion}`;
      case 'listFiles':
        return `/files?api-version=${apiVersion}`;
      case 'deleteFile':
        return `/files/${id}?api-version=${apiVersion}`;
      case 'retrieveFileContent':
        return `/files/${id}/content?api-version=${apiVersion}`;
      case 'listChatCompletions':
        return gatewayRequestPath + azureSpecificQueryParams;
      case 'getChatCompletion':
        return gatewayRequestPath + azureSpecificQueryParams;
      case 'getChatCompletionMessages':
        return gatewayRequestPath + azureSpecificQueryParams;
      case 'updateChatCompletion':
        return gatewayRequestPath + azureSpecificQueryParams;
      case 'deleteChatCompletion':
        return gatewayRequestPath + azureSpecificQueryParams;
      default:
        return '';
    }
  },
  getProxyEndpoint: ({ reqPath, reqQuery, providerOptions }) => {
    const { apiVersion } = providerOptions;
    if (!apiVersion) return `${reqPath}${reqQuery}`;
    if (!reqQuery?.includes('api-version')) {
      let _reqQuery = reqQuery;
      if (!reqQuery) {
        _reqQuery = `?api-version=${apiVersion}`;
      } else {
        _reqQuery += `&api-version=${apiVersion}`;
      }
      return `${reqPath}${_reqQuery}`;
    }
    return `${reqPath}${reqQuery}`;
  },
};

export default AzureOpenAIAPIConfig;
