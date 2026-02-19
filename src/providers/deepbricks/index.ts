import { ProviderConfigs } from '../types';
import DeepbricksAPIConfig from './api';
import {
  DeepbricksChatCompleteConfig,
  DeepbricksChatCompleteResponseTransform,
} from './chatComplete';
import {
  DeepbricksImageGenerateConfig,
  DeepbricksImageGenerateResponseTransform,
} from './imageGenerate';
import { deepbricksConfig } from './pricing';

const DeepbricksConfig: ProviderConfigs = {
  api: DeepbricksAPIConfig,
  chatComplete: DeepbricksChatCompleteConfig,
  imageGenerate: DeepbricksImageGenerateConfig,
  responseTransforms: {
    chatComplete: DeepbricksChatCompleteResponseTransform,
    imageGenerate: DeepbricksImageGenerateResponseTransform,
  },
  pricing: deepbricksConfig,
};

export default DeepbricksConfig;
