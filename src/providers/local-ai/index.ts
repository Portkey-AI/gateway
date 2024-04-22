import { ProviderConfigs } from '../types';
import {
  LocalAICompleteConfig,
  LocalAICompleteResponseTransform,
} from './complete';
import { LocalAIEmbedConfig, LocalAIEmbedResponseTransform } from './embed';
import LoalAIAPIConfig from './api';
import {
  LocalAIChatCompleteConfig,
  LocalAIChatCompleteResponseTransform,
} from './chatComplete';


const LocalAIConfig: ProviderConfigs = {
  complete: LocalAICompleteConfig,
  embed: LocalAIEmbedConfig,
  api: LoalAIAPIConfig,
  chatComplete: LocalAIChatCompleteConfig,
  responseTransforms: {
    complete: LocalAICompleteResponseTransform,
    // 'stream-complete': OpenAICompleteResponseTransform,
    chatComplete: LocalAIChatCompleteResponseTransform,
    // 'stream-chatComplete': OpenAIChatCompleteResponseTransform,
    embed: LocalAIEmbedResponseTransform,
  },
};

export default LocalAIConfig;
