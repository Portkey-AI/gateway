import { ProviderConfigs } from '../types';
import NscaleAPIConfig from './api';
import {
  NscaleChatCompleteConfig,
  NscaleChatCompleteResponseTransform,
  NscaleChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  NscaleImageGenerateConfig,
  NscaleImageGenerateResponseTransform,
} from './imageGenerate';

const NscaleConfig: ProviderConfigs = {
  chatComplete: NscaleChatCompleteConfig,
  imageGenerate: NscaleImageGenerateConfig,
  api: NscaleAPIConfig,
  responseTransforms: {
    chatComplete: NscaleChatCompleteResponseTransform,
    'stream-chatComplete': NscaleChatCompleteStreamChunkTransform,
    imageGenerate: NscaleImageGenerateResponseTransform,
  },
};

export default NscaleConfig;
