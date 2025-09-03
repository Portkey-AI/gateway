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
  GoogleBatchCreateConfig,
  GoogleBatchCreateResponseTransform,
} from './createBatch';
import {
  BatchOutputRequestHandler,
  BatchOutputResponseTransform,
} from './getBatchOutput';
import { GoogleListBatchesResponseTransform } from './listBatches';
import { GoogleCancelBatchResponseTransform } from './cancelBatch';
import {
  GoogleFileUploadRequestHandler,
  GoogleFileUploadResponseTransform,
} from './uploadFile';
import { GoogleRetrieveBatchResponseTransform } from './retrieveBatch';
import {
  GoogleFinetuneCreateResponseTransform,
  GoogleVertexFinetuneConfig,
} from './createFinetune';
import { GoogleRetrieveFileContentResponseTransform } from './retrieveFileContent';
import {
  GoogleRetrieveFileRequestHandler,
  GoogleRetrieveFileResponseTransform,
} from './retrieveFile';
import { GoogleFinetuneRetrieveResponseTransform } from './retrieveFinetune';
import { GoogleFinetuneListResponseTransform } from './listFinetunes';
import { GoogleListFilesRequestHandler } from './listFiles';
import {
  VertexAnthropicMessagesConfig,
  VertexAnthropicMessagesResponseTransform,
} from './messages';
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
      getBatchOutput: BatchOutputResponseTransform,
      listBatches: GoogleListBatchesResponseTransform,
      cancelBatch: GoogleCancelBatchResponseTransform,
      createBatch: GoogleBatchCreateResponseTransform,
      retrieveFileContent: GoogleRetrieveFileContentResponseTransform,
      retrieveFile: GoogleRetrieveFileResponseTransform,
      createFinetune: GoogleFinetuneCreateResponseTransform,
      retrieveFinetune: GoogleFinetuneRetrieveResponseTransform,
      listFinetunes: GoogleFinetuneListResponseTransform,
    };

    const baseConfig = {
      ...requestConfig,
      responseTransforms,
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
        };
      case 'anthropic':
        return {
          chatComplete: VertexAnthropicChatCompleteConfig,
          api: GoogleApiConfig,
          createBatch: GoogleBatchCreateConfig,
          createFinetune: baseConfig.createFinetune,
          messages: VertexAnthropicMessagesConfig,
          responseTransforms: {
            'stream-chatComplete':
              VertexAnthropicChatCompleteStreamChunkTransform,
            chatComplete: VertexAnthropicChatCompleteResponseTransform,
            messages: VertexAnthropicMessagesResponseTransform,
            ...responseTransforms,
          },
        };
      case 'meta':
        return {
          chatComplete: VertexLlamaChatCompleteConfig,
          createBatch: GoogleBatchCreateConfig,
          api: GoogleApiConfig,
          createFinetune: baseConfig.createFinetune,
          responseTransforms: {
            chatComplete: VertexLlamaChatCompleteResponseTransform,
            'stream-chatComplete': VertexLlamaChatCompleteStreamChunkTransform,
            ...responseTransforms,
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
          api: GoogleApiConfig,
          createFinetune: baseConfig.createFinetune,
          responseTransforms: {
            ...responseTransformers(GOOGLE_VERTEX_AI, {
              chatComplete: true,
            }),
            ...responseTransforms,
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
