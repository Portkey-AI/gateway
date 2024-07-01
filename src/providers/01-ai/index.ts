import { ProviderConfigs } from '../types';
import {
  ZeroOneAIChatCompleteConfig,
  ZeroOneChatCompleteResponseTransform,
} from './chatComplete';
import ZeroOneAIAPIConfig from './api';

const ZeroOneAIConfig: ProviderConfigs = {
  chatComplete: ZeroOneAIChatCompleteConfig,
  api: ZeroOneAIAPIConfig,
  responseTransforms: {
    chatComplete: ZeroOneChatCompleteResponseTransform,
  },
};

export default ZeroOneAIConfig;
