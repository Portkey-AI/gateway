import { ProviderConfigs } from '../types';
import SegmindAIAPIConfig from './api';
import {
  SegmindImageGenerateConfig,
  SegmindImageGenerateResponseTransform,
} from './imageGenerate';
import { SegmindLogConfig } from './pricing';

const SegmindConfig: ProviderConfigs = {
  api: SegmindAIAPIConfig,
  imageGenerate: SegmindImageGenerateConfig,
  responseTransforms: {
    imageGenerate: SegmindImageGenerateResponseTransform,
  },
  pricing: SegmindLogConfig,
};

export default SegmindConfig;
