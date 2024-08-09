import { ProviderConfigs } from '../types';
import MistralAIAPIConfig from './api';
import {
  MistralAIChatCompleteConfig,
  MistralAIChatCompleteResponseTransform,
  MistralAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { MistralAIEmbedConfig, MistralAIEmbedResponseTransform } from './embed';
import {
  MistralAIFimCompleteConfig, 
  MistralAIFimCompleteResponseTransform, 
  MistralAIFimCompleteStreamChunkTransform
} from './fimComplete'

const MistralAIConfig: ProviderConfigs = {
  chatComplete: MistralAIChatCompleteConfig,
  embed: MistralAIEmbedConfig,
  api: MistralAIAPIConfig,
  fimComplete: MistralAIFimCompleteConfig,
  responseTransforms: {
    chatComplete: MistralAIChatCompleteResponseTransform,
    'stream-chatComplete': MistralAIChatCompleteStreamChunkTransform,
    embed: MistralAIEmbedResponseTransform,
    fimComplete: MistralAIFimCompleteResponseTransform,
    'stream-fimComplete': MistralAIFimCompleteStreamChunkTransform
  },
};

export default MistralAIConfig;
