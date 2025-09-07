import { MISTRAL_AI } from '../../globals';
import { ProviderConfigs } from '../types';
import MistralAIAPIConfig from './api';
import {
  GetMistralAIChatCompleteResponseTransform,
  GetMistralAIChatCompleteStreamChunkTransform,
  MistralAIChatCompleteConfig,
} from './chatComplete';
import { MistralAIEmbedConfig, MistralAIEmbedResponseTransform } from './embed';

const MistralAIConfig: ProviderConfigs = {
  chatComplete: MistralAIChatCompleteConfig,
  embed: MistralAIEmbedConfig,
  api: MistralAIAPIConfig,
  responseTransforms: {
    chatComplete: GetMistralAIChatCompleteResponseTransform(MISTRAL_AI),
    'stream-chatComplete':
      GetMistralAIChatCompleteStreamChunkTransform(MISTRAL_AI),
    embed: MistralAIEmbedResponseTransform,
  },
};

export default MistralAIConfig;
