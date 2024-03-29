import { ProviderConfigs } from '../types';
import FireworksAIAPIConfig from './api';
import {
  FireworksAIChatCompleteConfig,
  FireworksAIChatCompleteResponseTransform,
  FireworksAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  FireworksAIEmbedConfig,
  FireworksAIEmbedResponseTransform,
} from './embed';

const FireworksAIConfig: ProviderConfigs = {
  chatComplete: FireworksAIChatCompleteConfig,
  embed: FireworksAIEmbedConfig,
  api: FireworksAIAPIConfig,
  responseTransforms: {
    chatComplete: FireworksAIChatCompleteResponseTransform,
    'stream-chatComplete': FireworksAIChatCompleteStreamChunkTransform,
    embed: FireworksAIEmbedResponseTransform,
  },
};

export default FireworksAIConfig;
