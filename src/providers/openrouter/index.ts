import { ProviderConfigs } from '../types';
import OpenrouterAPIConfig from './api';
import {
  OpenrouterChatCompleteConfig,
  OpenrouterChatCompleteResponseTransform,
  OpenrouterChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  OpenrouterImageGenerateConfig,
  OpenrouterImageGenerateResponseTransform,
} from './imageGenerate';

const OpenrouterConfig: ProviderConfigs = {
  chatComplete: OpenrouterChatCompleteConfig,
  imageGenerate: OpenrouterImageGenerateConfig,
  api: OpenrouterAPIConfig,
  responseTransforms: {
    chatComplete: OpenrouterChatCompleteResponseTransform,
    'stream-chatComplete': OpenrouterChatCompleteStreamChunkTransform,
    imageGenerate: OpenrouterImageGenerateResponseTransform,
  },
};

export default OpenrouterConfig;
