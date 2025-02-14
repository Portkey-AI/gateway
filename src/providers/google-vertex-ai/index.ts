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
import { GoogleBatchCreateHandler } from './createBatch';
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
import { GoogleRetriveBatchResponseTransform } from './retriveBatch';

const VertexConfig: ProviderConfigs = {
  api: VertexApiConfig,
  getConfig: (params: Params) => {
    const baseConfig = {
      uploadFile: {},
      createBatch: {},
      retrieveBatch: {},
      listBatches: {},
      cancelBatch: {},
      responseTransforms: {
        uploadFile: GoogleFileUploadResponseTransform,
        retrieveBatch: GoogleRetriveBatchResponseTransform,
        getBatchOutput: BatchOutputResponseTransform,
        listBatches: GoogleListBatchesResponseTransform,
        cancelBatch: GoogleCancelBatchResponseTransform,
      },
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
          responseTransforms: {
            'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
            chatComplete: GoogleChatCompleteResponseTransform,
            embed: GoogleEmbedResponseTransform,
            imageGenerate: GoogleImageGenResponseTransform,
          },
        };
      case 'anthropic':
        return {
          chatComplete: VertexAnthropicChatCompleteConfig,
          api: GoogleApiConfig,
          responseTransforms: {
            'stream-chatComplete':
              VertexAnthropicChatCompleteStreamChunkTransform,
            chatComplete: VertexAnthropicChatCompleteResponseTransform,
          },
        };
      case 'meta':
        return {
          chatComplete: VertexLlamaChatCompleteConfig,
          api: GoogleApiConfig,
          responseTransforms: {
            chatComplete: VertexLlamaChatCompleteResponseTransform,
            'stream-chatComplete': VertexLlamaChatCompleteStreamChunkTransform,
          },
        };
      case 'endpoints':
        return {
          chatComplete: chatCompleteParams([], {
            model: 'meta-llama-3-8b-instruct',
          }),
          api: GoogleApiConfig,
          responseTransforms: responseTransformers(GOOGLE_VERTEX_AI, {
            chatComplete: true,
          }),
        };
      default:
        return baseConfig;
    }
  },
  requestHandlers: {
    uploadFile: GoogleFileUploadRequestHandler,
    createBatch: GoogleBatchCreateHandler,
    getBatchOutput: BatchOutputRequestHandler,
  },
};

export default VertexConfig;
