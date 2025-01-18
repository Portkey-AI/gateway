import { ProviderConfigs } from '../types';
import SegmindAIAPIConfig from './api';
import {
  SegmindImageGenerateConfig,
  SegmindImageGenerateResponseTransform,
} from './imageGenerate';

const SegmindConfig: ProviderConfigs = {
  api: SegmindAIAPIConfig,
  imageGenerate: SegmindImageGenerateConfig,
  responseTransforms: {
    imageGenerate: SegmindImageGenerateResponseTransform,
  },
};

export default SegmindConfig;
