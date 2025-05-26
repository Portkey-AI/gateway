import { ProviderConfigs } from '../types';
import HyperbolicAPIConfig from './api';
import {
  HyperbolicChatCompleteConfig,
  HyperbolicChatCompleteResponseTransform,
  HyperbolicChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  HyperbolicImageGenerateConfig,
  HyperbolicImageGenerateResponseTransform,
} from './imageGenerate';

const HyperbolicConfig: ProviderConfigs = {
  chatComplete: HyperbolicChatCompleteConfig,
  imageGenerate: HyperbolicImageGenerateConfig,
  api: HyperbolicAPIConfig,
  responseTransforms: {
    chatComplete: HyperbolicChatCompleteResponseTransform,
    'stream-chatComplete': HyperbolicChatCompleteStreamChunkTransform,
    imageGenerate: HyperbolicImageGenerateResponseTransform,
  },
};

export default HyperbolicConfig;
