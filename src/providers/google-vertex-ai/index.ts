import { ProviderConfigs } from '../types';
import VertexApiConfig, { GoogleApiConfig } from './api';
import {
  GoogleChatCompleteResponseTransform,
  GoogleChatCompleteStreamChunkTransform,
  VertexAnthropicChatCompleteConfig,
  VertexAnthropicChatCompleteResponseTransform,
  VertexAnthropicChatCompleteStreamChunkTransform,
  VertexGoogleChatCompleteConfig,
  VertexLlamaChatCompleteConfig,
  VertexLlamaChatCompleteResponseTransform,
  VertexLlamaChatCompleteStreamChunkTransform,
} from './chatComplete';
import { GoogleEmbedConfig, GoogleEmbedResponseTransform } from './embed';
import { getModelAndProvider } from './utils';
import {
  GoogleImageGenConfig,
  GoogleImageGenResponseTransform,
} from './imageGenerate';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  GoogleFileUploadRequestHandler,
  GoogleFileUploadResponseTransform,
} from './uploadFile';
import {
  GoogleBatchCreateConfig,
  GoogleBatchCreateRequestTransform,
  GoogleBatchCreateResponseTransform,
} from './createBatch';
import { GoogleRetrieveBatchResponseTransform } from './retrieveBatch';
import {
  BatchOutputRequestHandler,
  BatchOutputResponseTransform,
} from './getBatchOutput';
import { GoogleListBatchesResponseTransform } from './listBatches';
import { GoogleCancelBatchResponseTransform } from './cancelBatch';
import {
  GoogleFinetuneCreateResponseTransform,
  GoogleVertexFinetuneConfig,
} from './createFinetune';
import { GoogleListFilesRequestHandler } from './listFiles';
import {
  GoogleRetrieveFileRequestHandler,
  GoogleRetrieveFileResponseTransform,
} from './retrieveFile';
import { GoogleFinetuneListResponseTransform } from './listFinetunes';
import { GoogleFinetuneRetrieveResponseTransform } from './retrieveFinetune';
import { GoogleRetrieveFileContentResponseTransform } from './retrieveFileContent';
import {
  VertexAnthropicMessagesConfig,
  VertexAnthropicMessagesResponseTransform,
} from './messages';
import { VertexAnthropicMessagesCountTokensConfig } from './messagesCountTokens';
import {
  GetMistralAIChatCompleteResponseTransform,
  GetMistralAIChatCompleteStreamChunkTransform,
  MistralAIChatCompleteConfig,
} from '../mistral-ai/chatComplete';

const VertexConfig: ProviderConfigs = {
  api: VertexApiConfig,
  getConfig: ({ params }) => {
    const requestConfig = {
      uploadFile: {},
      createBatch: GoogleBatchCreateConfig,
      retrieveBatch: {},
      listBatches: {},
      cancelBatch: {},
      createFinetune: GoogleVertexFinetuneConfig,
      retrieveFile: {},
      cancelFinetune: {},
      retrieveFileContent: {},
    };

    const responseTransforms = {
      uploadFile: GoogleFileUploadResponseTransform,
      retrieveBatch: GoogleRetrieveBatchResponseTransform,
      retrieveFile: GoogleRetrieveFileResponseTransform,
      getBatchOutput: BatchOutputResponseTransform,
      listBatches: GoogleListBatchesResponseTransform,
      cancelBatch: GoogleCancelBatchResponseTransform,
      createFinetune: GoogleFinetuneCreateResponseTransform,
      retrieveFinetune: GoogleFinetuneRetrieveResponseTransform,
      listFinetunes: GoogleFinetuneListResponseTransform,
      createBatch: GoogleBatchCreateResponseTransform,
      retrieveFileContent: GoogleRetrieveFileContentResponseTransform,
    };

    const requestTransforms = {
      createBatch: GoogleBatchCreateRequestTransform,
    };

    const baseConfig = {
      ...requestConfig,
      responseTransforms,
      requestTransforms,
    };

    const providerModel = params?.model;

    if (!providerModel) {
      return baseConfig;
    }

    const { provider } = getModelAndProvider(providerModel as string);
    switch (provider) {
      case 'google':
        return {
          chatComplete: VertexGoogleChatCompleteConfig,
          api: GoogleApiConfig,
          embed: GoogleEmbedConfig,
          imageGenerate: GoogleImageGenConfig,
          createBatch: GoogleBatchCreateConfig,
          createFinetune: baseConfig.createFinetune,
          responseTransforms: {
            'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
            chatComplete: GoogleChatCompleteResponseTransform,
            embed: GoogleEmbedResponseTransform,
            imageGenerate: GoogleImageGenResponseTransform,
            ...responseTransforms,
          },
          requestTransforms: {
            ...baseConfig.requestTransforms,
          },
        };
      case 'anthropic':
        return {
          chatComplete: VertexAnthropicChatCompleteConfig,
          api: GoogleApiConfig,
          createBatch: GoogleBatchCreateConfig,
          createFinetune: baseConfig.createFinetune,
          messages: VertexAnthropicMessagesConfig,
          messagesCountTokens: VertexAnthropicMessagesCountTokensConfig,
          responseTransforms: {
            'stream-chatComplete':
              VertexAnthropicChatCompleteStreamChunkTransform,
            chatComplete: VertexAnthropicChatCompleteResponseTransform,
            messages: VertexAnthropicMessagesResponseTransform,
            ...responseTransforms,
          },
          requestTransforms: {
            ...baseConfig.requestTransforms,
          },
        };
      case 'meta':
        return {
          chatComplete: VertexLlamaChatCompleteConfig,
          api: GoogleApiConfig,
          createBatch: GoogleBatchCreateConfig,
          createFinetune: baseConfig.createFinetune,
          responseTransforms: {
            chatComplete: VertexLlamaChatCompleteResponseTransform,
            'stream-chatComplete': VertexLlamaChatCompleteStreamChunkTransform,
            ...responseTransforms,
          },
          requestTransforms: {
            ...baseConfig.requestTransforms,
          },
        };
      case 'endpoints':
        return {
          chatComplete: chatCompleteParams(
            ['model'],
            {},
            {
              model: {
                param: 'model',
                transform: (params: Params) => {
                  const _model = params.model;
                  return _model?.replace('endpoints.', '');
                },
              },
            }
          ),
          createBatch: GoogleBatchCreateConfig,
          createFinetune: baseConfig.createFinetune,
          api: GoogleApiConfig,
          responseTransforms: {
            ...responseTransformers(GOOGLE_VERTEX_AI, {
              chatComplete: true,
            }),
            ...responseTransforms,
          },
          requestTransforms: {
            ...baseConfig.requestTransforms,
          },
        };
      case 'mistralai':
        return {
          chatComplete: MistralAIChatCompleteConfig,
          api: GoogleApiConfig,
          responseTransforms: {
            chatComplete:
              GetMistralAIChatCompleteResponseTransform(GOOGLE_VERTEX_AI),
            'stream-chatComplete':
              GetMistralAIChatCompleteStreamChunkTransform(GOOGLE_VERTEX_AI),
          },
        };
      default:
        return baseConfig;
    }
  },
  requestHandlers: {
    uploadFile: GoogleFileUploadRequestHandler,
    getBatchOutput: BatchOutputRequestHandler,
    listFiles: GoogleListFilesRequestHandler,
    retrieveFile: GoogleRetrieveFileRequestHandler,
  },
};

export default VertexConfig;
