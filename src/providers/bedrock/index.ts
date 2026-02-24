import { AI21, ANTHROPIC, COHERE } from '../../globals';
import { Params } from '../../types/requestBody';
import { ProviderConfigs } from '../types';
import BedrockAPIConfig from './api';
import { BedrockCancelBatchResponseTransform } from './cancelBatch';
import {
  BedrockConverseChatCompleteConfig,
  BedrockChatCompleteStreamChunkTransform,
  BedrockChatCompleteResponseTransform,
  BedrockCohereChatCompleteConfig,
  BedrockCohereChatCompleteStreamChunkTransform,
  BedrockCohereChatCompleteResponseTransform,
  BedrockAI21ChatCompleteConfig,
  BedrockAI21ChatCompleteResponseTransform,
  BedrockConverseAnthropicChatCompleteConfig,
  BedrockConverseCohereChatCompleteConfig,
  BedrockConverseAI21ChatCompleteConfig,
} from './chatComplete';
import {
  BedrockAI21CompleteConfig,
  BedrockAI21CompleteResponseTransform,
  BedrockAnthropicCompleteConfig,
  BedrockAnthropicCompleteResponseTransform,
  BedrockAnthropicCompleteStreamChunkTransform,
  BedrockCohereCompleteConfig,
  BedrockCohereCompleteResponseTransform,
  BedrockCohereCompleteStreamChunkTransform,
  BedrockLLamaCompleteConfig,
  BedrockLlamaCompleteResponseTransform,
  BedrockLlamaCompleteStreamChunkTransform,
  BedrockMistralCompleteConfig,
  BedrockMistralCompleteResponseTransform,
  BedrockMistralCompleteStreamChunkTransform,
  BedrockTitanCompleteConfig,
  BedrockTitanCompleteResponseTransform,
  BedrockTitanCompleteStreamChunkTransform,
} from './complete';
import { BEDROCK_STABILITY_V1_MODELS } from './constants';
import {
  BedrockCreateBatchConfig,
  BedrockCreateBatchResponseTransform,
  BedrockCreateRequestBodyTransform,
} from './createBatch';
import {
  BedrockCreateFinetuneConfig,
  BedrockCreateFinetuneResponseTransform,
} from './createFinetune';
import {
  BedrockCohereEmbedConfig,
  BedrockCohereEmbedResponseTransform,
  BedrockTitanEmbedConfig,
  BedrockTitanEmbedResponseTransform,
} from './embed';
import { BedrockRerankConfig, BedrockRerankResponseTransform } from './rerank';
import {
  BedrockGetBatchOutputRequestHandler,
  BedrockGetBatchOutputResponseTransform,
} from './getBatchOutput';
import {
  BedrockStabilityAIImageGenerateV1Config,
  BedrockStabilityAIImageGenerateV1ResponseTransform,
  BedrockStabilityAIImageGenerateV2Config,
  BedrockStabilityAIImageGenerateV2ResponseTransform,
} from './imageGenerate';
import { BedrockListBatchesResponseTransform } from './listBatches';
import { BedrockListFinetuneResponseTransform } from './listFinetunes';
import { BedrockRetrieveBatchResponseTransform } from './retrieveBatch';
import { BedrockRetrieveFileRequestHandler } from './retrieveFile';
import {
  BedrockRetrieveFileContentRequestHandler,
  BedrockRetrieveFileContentResponseTransform,
} from './retrieveFileContent';
import { BedrockFinetuneResponseTransform } from './retrieveFinetune';
import {
  BedrockUploadFileRequestHandler,
  BedrockUploadFileResponseTransform,
} from './uploadFile';
import { BedrockListFilesResponseTransform } from './listfiles';
import { BedrockDeleteFileResponseTransform } from './deleteFile';
import {
  BedrockAnthropicMessagesResponseTransform,
  BedrockAnthropicMessagesStreamChunkTransform,
  BedrockConverseAnthropicMessagesConfig,
  BedrockConverseMessagesConfig,
  BedrockConverseMessagesStreamChunkTransform,
  BedrockMessagesResponseTransform,
} from './messages';
import {
  BedrockAnthropicMessageCountTokensConfig,
  BedrockConverseMessageCountTokensConfig,
  BedrockConverseMessageCountTokensResponseTransform,
} from './countTokens';
import { getBedrockModelWithoutRegion } from './utils';
import { BedrockLogConfig } from './pricing';

export const getProviderAndModel = (params: Params) => {
  let providerModel = params.foundationModel || params.model || '';
  providerModel = getBedrockModelWithoutRegion(providerModel);
  const providerModelArray = providerModel?.split('.');
  const provider = providerModelArray?.[0];
  const model = providerModelArray?.slice(1).join('.');
  return { provider, model };
};

const BedrockConfig: ProviderConfigs = {
  api: BedrockAPIConfig,
  pricing: BedrockLogConfig,
  requestHandlers: {
    uploadFile: BedrockUploadFileRequestHandler,
    retrieveFile: BedrockRetrieveFileRequestHandler,
    getBatchOutput: BedrockGetBatchOutputRequestHandler,
    retrieveFileContent: BedrockRetrieveFileContentRequestHandler,
  },
  getConfig: ({ params }) => {
    // To remove the region in case its a cross-region inference profile ID
    // https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference-support.html
    let config: ProviderConfigs = {};

    if (params.model) {
      const { provider, model } = getProviderAndModel(params);
      switch (provider) {
        case ANTHROPIC:
          config = {
            complete: BedrockAnthropicCompleteConfig,
            chatComplete: BedrockConverseAnthropicChatCompleteConfig,
            messages: BedrockConverseAnthropicMessagesConfig,
            api: BedrockAPIConfig,
            messagesCountTokens: BedrockAnthropicMessageCountTokensConfig,
            responseTransforms: {
              'stream-complete': BedrockAnthropicCompleteStreamChunkTransform,
              complete: BedrockAnthropicCompleteResponseTransform,
              messages: BedrockAnthropicMessagesResponseTransform,
              'stream-messages': BedrockAnthropicMessagesStreamChunkTransform,
            },
          };
          break;
        case COHERE:
          config = {
            complete: BedrockCohereCompleteConfig,
            chatComplete: BedrockConverseCohereChatCompleteConfig,
            embed: BedrockCohereEmbedConfig,
            api: BedrockAPIConfig,
            responseTransforms: {
              'stream-complete': BedrockCohereCompleteStreamChunkTransform,
              complete: BedrockCohereCompleteResponseTransform,
              embed: BedrockCohereEmbedResponseTransform,
              messages: BedrockMessagesResponseTransform,
              'stream-messages': BedrockConverseMessagesStreamChunkTransform,
            },
          };
          if (['command-text-v14', 'command-light-text-v14'].includes(model)) {
            config.chatComplete = BedrockCohereChatCompleteConfig;
            config.responseTransforms['stream-chatComplete'] =
              BedrockCohereChatCompleteStreamChunkTransform;
            config.responseTransforms.chatComplete =
              BedrockCohereChatCompleteResponseTransform;
          }
          break;
        case 'meta':
          config = {
            complete: BedrockLLamaCompleteConfig,
            api: BedrockAPIConfig,
            responseTransforms: {
              'stream-complete': BedrockLlamaCompleteStreamChunkTransform,
              complete: BedrockLlamaCompleteResponseTransform,
              messages: BedrockMessagesResponseTransform,
              'stream-messages': BedrockConverseMessagesStreamChunkTransform,
            },
          };
          break;
        case 'mistral':
          config = {
            complete: BedrockMistralCompleteConfig,
            api: BedrockAPIConfig,
            responseTransforms: {
              'stream-complete': BedrockMistralCompleteStreamChunkTransform,
              complete: BedrockMistralCompleteResponseTransform,
              messages: BedrockMessagesResponseTransform,
              'stream-messages': BedrockConverseMessagesStreamChunkTransform,
            },
          };
          break;
        case 'amazon':
          config = {
            complete: BedrockTitanCompleteConfig,
            embed: BedrockTitanEmbedConfig,
            api: BedrockAPIConfig,
            responseTransforms: {
              'stream-complete': BedrockTitanCompleteStreamChunkTransform,
              complete: BedrockTitanCompleteResponseTransform,
              embed: BedrockTitanEmbedResponseTransform,
              messages: BedrockMessagesResponseTransform,
              'stream-messages': BedrockConverseMessagesStreamChunkTransform,
            },
          };
          break;
        case AI21:
          config = {
            complete: BedrockAI21CompleteConfig,
            api: BedrockAPIConfig,
            chatComplete: BedrockConverseAI21ChatCompleteConfig,
            responseTransforms: {
              complete: BedrockAI21CompleteResponseTransform,
              messages: BedrockMessagesResponseTransform,
              'stream-messages': BedrockConverseMessagesStreamChunkTransform,
            },
          };
          if (['j2-mid-v1', 'j2-ultra-v1'].includes(model)) {
            config.chatComplete = BedrockAI21ChatCompleteConfig;
            config.responseTransforms.chatComplete =
              BedrockAI21ChatCompleteResponseTransform;
          }
          break;
        case 'stability':
          if (model && BEDROCK_STABILITY_V1_MODELS.includes(model)) {
            return {
              imageGenerate: BedrockStabilityAIImageGenerateV1Config,
              api: BedrockAPIConfig,
              responseTransforms: {
                imageGenerate:
                  BedrockStabilityAIImageGenerateV1ResponseTransform,
              },
            };
          }
          return {
            imageGenerate: BedrockStabilityAIImageGenerateV2Config,
            api: BedrockAPIConfig,
            responseTransforms: {
              imageGenerate: BedrockStabilityAIImageGenerateV2ResponseTransform,
            },
          };
      }

      // defaults
      config = {
        ...config,
        ...(!config.chatComplete && {
          chatComplete: BedrockConverseChatCompleteConfig,
        }),
        ...(!config.messages && {
          messages: BedrockConverseMessagesConfig,
        }),
        ...(!config.messagesCountTokens && {
          messagesCountTokens: BedrockConverseMessageCountTokensConfig,
        }),
      };

      config.responseTransforms = {
        ...(config.responseTransforms ?? {}),
        ...(!config.responseTransforms?.chatComplete && {
          chatComplete: BedrockChatCompleteResponseTransform,
        }),
        ...(!config.responseTransforms?.['stream-chatComplete'] && {
          'stream-chatComplete': BedrockChatCompleteStreamChunkTransform,
        }),
        ...(!config.responseTransforms?.messagesCountTokens && {
          messagesCountTokens:
            BedrockConverseMessageCountTokensResponseTransform,
        }),
      };
    }

    const commonResponseTransforms = {
      uploadFile: BedrockUploadFileResponseTransform,
      createBatch: BedrockCreateBatchResponseTransform,
      cancelBatch: BedrockCancelBatchResponseTransform,
      retrieveBatch: BedrockRetrieveBatchResponseTransform,
      listBatches: BedrockListBatchesResponseTransform,
      getBatchOutput: BedrockGetBatchOutputResponseTransform,
      retrieveFileContent: BedrockRetrieveFileContentResponseTransform,
      createFinetune: BedrockCreateFinetuneResponseTransform,
      retrieveFinetune: BedrockFinetuneResponseTransform,
      listFinetunes: BedrockListFinetuneResponseTransform,
      listFiles: BedrockListFilesResponseTransform,
      deleteFile: BedrockDeleteFileResponseTransform,
      rerank: BedrockRerankResponseTransform,
    };
    if (!config.responseTransforms) {
      config.responseTransforms = commonResponseTransforms;
    } else {
      config.responseTransforms = {
        ...config.responseTransforms,
        ...commonResponseTransforms,
      };
    }
    config.createBatch = BedrockCreateBatchConfig;
    config.createFinetune = BedrockCreateFinetuneConfig;
    config.rerank = BedrockRerankConfig;
    config.cancelBatch = {};
    config.cancelFinetune = {};
    config.requestTransforms = {
      ...(config.requestTransforms ?? {}),
      createBatch: BedrockCreateRequestBodyTransform,
    };
    return config;
  },
};

export default BedrockConfig;
