import { ProviderConfigs } from '../types';
import crofaiApiConfig from './api';
import {
  crofaiChatCompleteConfig,
  crofaiChatCompleteResponseTransform,
  crofaiChatCompleteStreamChunkTransform,
} from './chatComplete';

const crofaiConfig: ProviderConfigs = {
  chatComplete: crofaiChatCompleteConfig,
  api: crofaiApiConfig,
  responseTransforms: {
    chatComplete: crofaiChatCompleteResponseTransform,
    'stream-chatComplete': crofaiChatCompleteStreamChunkTransform,
  },
};

export default crofaiConfig;
