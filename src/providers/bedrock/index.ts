import { AI21, ANTHROPIC, COHERE } from '../../globals';
import { Params } from '../../types/requestBody';
import { ProviderConfigs } from '../types';
import BedrockAPIConfig from './api';
import {
  BedrockConverseChatCompleteConfig,
  BedrockChatCompleteStreamChunkTransform,
  BedrockChatCompleteResponseTransform,
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
import {
  BedrockCohereEmbedConfig,
  BedrockCohereEmbedResponseTransform,
  BedrockTitanEmbedConfig,
  BedrockTitanEmbedResponseTransform,
} from './embed';
import {
  BedrockStabilityAIImageGenerateConfig,
  BedrockStabilityAIImageGenerateResponseTransform,
} from './imageGenerate';

const BedrockConfig: ProviderConfigs = {
  api: BedrockAPIConfig,
  getConfig: (params: Params) => {
    const providerModel = params.model;
    const provider = providerModel?.split('.')[0];
    let config: ProviderConfigs = {};
    switch (provider) {
      case ANTHROPIC:
        config = {
          complete: BedrockAnthropicCompleteConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            'stream-complete': BedrockAnthropicCompleteStreamChunkTransform,
            complete: BedrockAnthropicCompleteResponseTransform,
          },
        };
      case COHERE:
        config = {
          complete: BedrockCohereCompleteConfig,
          embed: BedrockCohereEmbedConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            'stream-complete': BedrockCohereCompleteStreamChunkTransform,
            complete: BedrockCohereCompleteResponseTransform,
            embed: BedrockCohereEmbedResponseTransform,
          },
        };
      case 'meta':
        config = {
          complete: BedrockLLamaCompleteConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            'stream-complete': BedrockLlamaCompleteStreamChunkTransform,
            complete: BedrockLlamaCompleteResponseTransform,
          },
        };
      case 'mistral':
        config = {
          complete: BedrockMistralCompleteConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            'stream-complete': BedrockMistralCompleteStreamChunkTransform,
            complete: BedrockMistralCompleteResponseTransform,
          },
        };
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
      case AI21:
        config = {
          complete: BedrockAI21CompleteConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            complete: BedrockAI21CompleteResponseTransform,
          },
        };
      case 'stability':
        config = {
          imageGenerate: BedrockStabilityAIImageGenerateConfig,
          api: BedrockAPIConfig,
          responseTransforms: {
            imageGenerate: BedrockStabilityAIImageGenerateResponseTransform,
          },
        };
    }
    config.chatComplete = BedrockConverseChatCompleteConfig;
    config.responseTransforms['stream-chatComplete'] =
      BedrockChatCompleteStreamChunkTransform;
    config.responseTransforms.chatComplete =
      BedrockChatCompleteResponseTransform;
    return config;
  },
};

export default BedrockConfig;
