import { ProviderConfigs } from '../types';
import {
  SiliconFlowAIEmbedConfig,
  SiliconFlowAIEmbedResponseTransform,
} from './embed';
import SiliconFlowAIAPIConfig from './api';
import {
  SiliconFlowAIChatCompleteConfig,
  SiliconFlowAIChatCompleteResponseTransform,
} from './chatComplete';
import {
  SiliconFlowAIImageGenerateConfig,
  SiliconFlowAIImageGenerateResponseTransform,
} from './imageGenerate';

const SiliconFlowAIConfig: ProviderConfigs = {
  embed: SiliconFlowAIEmbedConfig,
  api: SiliconFlowAIAPIConfig,
  chatComplete: SiliconFlowAIChatCompleteConfig,
  imageGenerate: SiliconFlowAIImageGenerateConfig,
  responseTransforms: {
    chatComplete: SiliconFlowAIChatCompleteResponseTransform,
    embed: SiliconFlowAIEmbedResponseTransform,
    imageGenerate: SiliconFlowAIImageGenerateResponseTransform,
  },
};

export default SiliconFlowAIConfig;
