import { ProviderConfigs } from '../types';
import NscaleAPIConfig from './api';
import {
  NscaleChatCompleteConfig,
  NscaleChatCompleteResponseTransform,
  NscaleChatCompleteStreamChunkTransform,
} from './chatComplete';

const NscaleConfig: ProviderConfigs = {
  chatComplete: NscaleChatCompleteConfig,
  api: NscaleAPIConfig,
  responseTransforms: {
    chatComplete: NscaleChatCompleteResponseTransform,
    'stream-chatComplete': NscaleChatCompleteStreamChunkTransform,
  },
};

export default NscaleConfig;
