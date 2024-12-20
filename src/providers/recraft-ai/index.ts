import { ProviderConfigs } from '../types';
import RecraftAIAPIConfig from './api';
import {
  RecraftAIImageGenerateConfig,
  RecraftAIImageGenerateResponseTransform,
} from './imageGenerate';

const RecraftAIConfig: ProviderConfigs = {
  imageGenerate: RecraftAIImageGenerateConfig,
  api: RecraftAIAPIConfig,
  responseTransforms: {
    imageGenerate: RecraftAIImageGenerateResponseTransform,
  },
};

export default RecraftAIConfig;
