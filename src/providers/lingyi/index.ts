import { ProviderConfigs } from '../types';
import LingYiAPIConfig from './api';
import {
  LingYiChatCompleteConfig,
  LingYiChatCompleteResponseTransform,
  LingYiChatCompleteStreamChunkTransform,
} from './chatComplete';

const LingYiConfig: ProviderConfigs = {
  chatComplete: LingYiChatCompleteConfig,
  api: LingYiAPIConfig,
  responseTransforms: {
    chatComplete: LingYiChatCompleteResponseTransform,
    'stream-chatComplete': LingYiChatCompleteStreamChunkTransform,
  },
};

export default LingYiConfig;
