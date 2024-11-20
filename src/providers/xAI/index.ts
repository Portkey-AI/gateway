import { ProviderConfig, ProviderConfigs } from '../types';
import xAIAPIConfig from './api';
import {
  xAIChatCompleteConfig,
  xAIChatCompleteResponseTransform,
  xAIChatCompleteStreamChunkTransform,
} from './chatComplete';

const xAIConfig: ProviderConfigs = {
  chatComplete: xAIChatCompleteConfig,
  api: xAIAPIConfig,
  responseTransforms: {
    chatComplete: xAIChatCompleteResponseTransform,
    'stream-chatComplete': xAIChatCompleteStreamChunkTransform,
  },
};

export default xAIConfig;
