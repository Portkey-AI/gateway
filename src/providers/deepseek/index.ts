import { ProviderConfigs } from '../types';
import DeepSeekAPIConfig from './api';
import {
  DeepSeekChatCompleteConfig,
  DeepSeekChatCompleteResponseTransform,
  DeepSeekChatCompleteStreamChunkTransform,
} from './chatComplete';
import { DeepseekLogConfig } from './pricing';

const DeepSeekConfig: ProviderConfigs = {
  chatComplete: DeepSeekChatCompleteConfig,
  api: DeepSeekAPIConfig,
  responseTransforms: {
    chatComplete: DeepSeekChatCompleteResponseTransform,
    'stream-chatComplete': DeepSeekChatCompleteStreamChunkTransform,
  },
  pricing: DeepseekLogConfig,
};

export default DeepSeekConfig;
