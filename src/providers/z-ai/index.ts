import { ProviderConfigs } from '../types';
import ZAIAPIConfig from './api';
import {
  ZAIChatCompleteConfig,
  ZAIChatCompleteResponseTransform,
  ZAIChatCompleteStreamChunkTransform,
} from './chatComplete';

const ZAIConfig: ProviderConfigs = {
  chatComplete: ZAIChatCompleteConfig,
  api: ZAIAPIConfig,
  responseTransforms: {
    chatComplete: ZAIChatCompleteResponseTransform,
    'stream-chatComplete': ZAIChatCompleteStreamChunkTransform,
  },
};

export default ZAIConfig;
