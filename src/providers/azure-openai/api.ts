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
    const searchParams = urlObj.searchParams;
    if (apiVersion) {
      searchParams.set('api-version', apiVersion);
    }

    let prefix = `/deployments/${deploymentId}`;
    const isAzureV1API = apiVersion?.trim() === 'v1';

    const pathname = !isAzureV1API
      ? urlObj.pathname.replace('/v1', '')
      : urlObj.pathname;

    if (isAzureV1API) {
      prefix = '/v1';
      searchParams.delete('api-version');
    }

    switch (mappedFn) {
      case 'complete': {
        return `${prefix}/completions?${searchParams.toString()}`;
      }
      case 'chatComplete': {
        return `${prefix}/chat/completions?${searchParams.toString()}`;
      }
      case 'embed': {
        return `${prefix}/embeddings?${searchParams.toString()}`;
      }
      case 'imageGenerate': {
        return `${prefix}/images/generations?${searchParams.toString()}`;
      }
      case 'imageEdit': {
        return `${prefix}/images/edits?${searchParams.toString()}`;
      }
      case 'createSpeech': {
        return `${prefix}/audio/speech?${searchParams.toString()}`;
      }
      case 'createTranscription': {
        return `${prefix}/audio/transcriptions?${searchParams.toString()}`;
      }
      case 'createTranslation': {
        return `${prefix}/audio/translations?${searchParams.toString()}`;
      }
      case 'realtime': {
        searchParams.set('deployment', deploymentId || '');
        return `${isAzureV1API ? prefix : ''}/realtime?${searchParams.toString()}`;
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
        return `${pathname}?${searchParams.toString()}`;
      default:
        return '';
    }
  },
  getProxyEndpoint: ({ reqPath, reqQuery, providerOptions }) => {
    const { apiVersion } = providerOptions;
    const defaultEndpoint = `${reqPath}${reqQuery}`;
    if (!apiVersion) {
      return defaultEndpoint; // append /v1 to the request path
    }
    if (apiVersion?.trim() === 'v1') {
      return `/v1${reqPath}${reqQuery}`;
    }
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
