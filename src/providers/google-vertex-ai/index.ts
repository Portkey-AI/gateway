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

const VertexConfig: ProviderConfigs = {
  api: VertexApiConfig,
  getConfig: (params: Params) => {
    const requestConfig = {
      uploadFile: {},
      createBatch: GoogleBatchCreateConfig,
      retrieveBatch: {},
      listBatches: {},
      cancelBatch: {},
    };

    const responseTransforms = {
      uploadFile: GoogleFileUploadResponseTransform,
      retrieveBatch: GoogleRetrieveBatchResponseTransform,
      getBatchOutput: BatchOutputResponseTransform,
      listBatches: GoogleListBatchesResponseTransform,
      cancelBatch: GoogleCancelBatchResponseTransform,
      createBatch: GoogleBatchCreateResponseTransform,
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
          responseTransforms: {
            'stream-chatComplete':
              VertexAnthropicChatCompleteStreamChunkTransform,
            chatComplete: VertexAnthropicChatCompleteResponseTransform,
            ...responseTransforms,
          },
        };
      case 'meta':
        return {
          chatComplete: VertexLlamaChatCompleteConfig,
          createBatch: GoogleBatchCreateConfig,
          api: GoogleApiConfig,
          responseTransforms: {
            chatComplete: VertexLlamaChatCompleteResponseTransform,
            'stream-chatComplete': VertexLlamaChatCompleteStreamChunkTransform,
            ...responseTransforms,
          },
        };
      case 'endpoints':
        return {
          chatComplete: chatCompleteParams([], {
            model: 'meta-llama-3-8b-instruct',
          }),
          createBatch: GoogleBatchCreateConfig,
          api: GoogleApiConfig,
          responseTransforms: {
            ...responseTransformers(GOOGLE_VERTEX_AI, {
              chatComplete: true,
            }),
            ...responseTransforms,
          },
        };
      default:
        return baseConfig;
    }
  },
  requestHandlers: {
    uploadFile: GoogleFileUploadRequestHandler,
    getBatchOutput: BatchOutputRequestHandler,
  },
};

export default VertexConfig;
