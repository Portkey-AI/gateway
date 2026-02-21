import { ProviderConfigs } from '../types';
import ModelsLabAPIConfig from './api';
import {
  ModelsLabImageGenerateConfig,
  ModelsLabImageGenerateResponseTransform,
} from './imageGenerate';

const ModelsLabConfig: ProviderConfigs = {
  api: ModelsLabAPIConfig,
  imageGenerate: ModelsLabImageGenerateConfig,
  responseTransforms: {
    imageGenerate: ModelsLabImageGenerateResponseTransform,
  },
};

export default ModelsLabConfig;
