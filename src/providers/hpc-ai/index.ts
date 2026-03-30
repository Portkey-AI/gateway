import { ProviderConfigs } from '../types';
import HpcAiApiConfig from './api';
import {
  HpcAiChatCompleteConfig,
  HpcAiChatCompleteResponseTransform,
  HpcAiChatCompleteStreamChunkTransform,
} from './chatComplete';

const HpcAiConfig: ProviderConfigs = {
  chatComplete: HpcAiChatCompleteConfig,
  api: HpcAiApiConfig,
  responseTransforms: {
    chatComplete: HpcAiChatCompleteResponseTransform,
    'stream-chatComplete': HpcAiChatCompleteStreamChunkTransform,
  },
};

export default HpcAiConfig;
