import { GatewayError } from '../../errors/GatewayError';
import { AI21, ANTHROPIC, COHERE } from '../../globals';
import { Params } from '../../types/requestBody';
import { ProviderConfigs } from '../types';
import BedrockAPIConfig from './api';
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
  BedrockCohereEmbedConfig,
  BedrockCohereEmbedResponseTransform,
  BedrockTitanEmbedConfig,
  BedrockTitanEmbedResponseTransform,
} from './embed';
import {
  BedrockStabilityAIImageGenerateV1Config,
  BedrockStabilityAIImageGenerateV1ResponseTransform,
  BedrockStabilityAIImageGenerateV2Config,
  BedrockStabilityAIImageGenerateV2ResponseTransform,
} from './imageGenerate';

const BedrockConfig: ProviderConfigs = {
  api: BedrockAPIConfig,
  getConfig: (params: Params) => {
    if (!params.model) {
      throw new GatewayError('Bedrock model not found');
    }

    // To remove the region in case its a cross-region inference profile ID
    // https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference-support.html
    const providerModel = params.model.replace(/^(us\.|eu\.)/, '');
    const providerModelArray = providerModel.split('.');
    const provider = providerModelArray[0];
    const model = providerModelArray.slice(1).join('.');
    let config: ProviderConfigs = {};
    switch (provider) {
      case ANTHROPIC:
        config = {
          complete: BedrockAnthropicCompleteConfig,
          chatComplete: BedrockConverseAnthropicChatCompleteConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            'stream-complete': BedrockAnthropicCompleteStreamChunkTransform,
            complete: BedrockAnthropicCompleteResponseTransform,
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
              imageGenerate: BedrockStabilityAIImageGenerateV1ResponseTransform,
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
        break;
    }
    if (!config.chatComplete) {
      config.chatComplete = BedrockConverseChatCompleteConfig;
    }
    if (!config.responseTransforms['stream-chatComplete']) {
      config.responseTransforms['stream-chatComplete'] =
        BedrockChatCompleteStreamChunkTransform;
    }
    if (!config.responseTransforms.chatComplete) {
      config.responseTransforms.chatComplete =
        BedrockChatCompleteResponseTransform;
    }
    return config;
  },
};

export default BedrockConfig;
