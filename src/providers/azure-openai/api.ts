import { Environment } from '../../utils/env';
import { ProviderAPIConfig } from '../types';
import {
  getAccessTokenFromEntraId,
  getAzureManagedIdentityToken,
  getAzureWorkloadIdentityToken,
} from './utils';
import { getRuntimeKey } from 'hono/adapter';

const runtime = getRuntimeKey();

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { resourceName } = providerOptions;
    return `https://${resourceName}.openai.azure.com/openai`;
  },
  headers: async ({ providerOptions, fn, c }) => {
    const { apiKey, azureAdToken, azureAuthMode } = providerOptions;
    if (azureAdToken) {
      return {
        Authorization: `Bearer ${azureAdToken?.replace('Bearer ', '')}`,
      };
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
    // `AZURE_FEDERATED_TOKEN_FILE` is injected by runtime, skipping serverless for now.
    if (azureAuthMode === 'workload' && runtime === 'node') {
      const { azureWorkloadClientId } = providerOptions;

      const authorityHost = Environment(c).AZURE_AUTHORITY_HOST;
      const tenantId = Environment(c).AZURE_TENANT_ID;
      const clientId = azureWorkloadClientId || Environment(c).AZURE_CLIENT_ID;
      const federatedTokenFile = Environment(c).AZURE_FEDERATED_TOKEN_FILE;

      if (authorityHost && tenantId && clientId && federatedTokenFile) {
        const fs = await import('fs');
        const federatedToken = fs.readFileSync(federatedTokenFile, 'utf8');

        if (federatedToken) {
          const scope = 'https://cognitiveservices.azure.com/.default';
          const accessToken = await getAzureWorkloadIdentityToken(
            authorityHost,
            tenantId,
            clientId,
            federatedToken,
            scope
          );
          return {
            Authorization: `Bearer ${accessToken}`,
          };
        }
      }
    }
    const headersObj: Record<string, string> = {
      'api-key': `${apiKey}`,
    };
    if (
      fn === 'createTranscription' ||
      fn === 'createTranslation' ||
      fn === 'uploadFile' ||
      fn === 'imageEdit'
    ) {
      headersObj['Content-Type'] = 'multipart/form-data';
    }
    if (providerOptions.openaiBeta) {
      headersObj['OpenAI-Beta'] = providerOptions.openaiBeta;
    }
    return headersObj;
  },
  getEndpoint: ({ providerOptions, fn, gatewayRequestURL }) => {
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

    const urlObj = new URL(gatewayRequestURL);
    const pathname = urlObj.pathname.replace('/v1', '');
    const searchParams = urlObj.searchParams;
    if (apiVersion) {
      searchParams.set('api-version', apiVersion);
    }

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
      case 'imageEdit': {
        return `/deployments/${deploymentId}/images/edits?api-version=${apiVersion}`;
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
        return `/realtime?api-version=${apiVersion}&deployment=${deploymentId}`;
      }
      case 'createModelResponse': {
        return `${pathname}?${searchParams.toString()}`;
      }
      case 'getModelResponse': {
        return `${pathname}?${searchParams.toString()}`;
      }
      case 'deleteModelResponse': {
        return `${pathname}?${searchParams.toString()}`;
      }
      case 'listResponseInputItems': {
        return `${pathname}?${searchParams.toString()}`;
      }
      case 'uploadFile':
      case 'retrieveFile':
      case 'listFiles':
      case 'deleteFile':
      case 'retrieveFileContent':
      case 'createFinetune':
      case 'retrieveFinetune':
      case 'listFinetunes':
      case 'cancelFinetune':
      case 'createBatch':
      case 'retrieveBatch':
      case 'cancelBatch':
      case 'listBatches':
        return `${pathname}?api-version=${apiVersion}`;
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
