import { ProviderConfigs } from '../types';
import SegmindAIAPIConfig from './api';
import {
  SegmindImageGenerateConfig,
  SegmindImageGenerateResponseTransform,
  SegmindImageToJsonResponseTransform,
} from './imageGenerate';

const SegmindConfig: ProviderConfigs = {
  api: SegmindAIAPIConfig,
  imageGenerate: SegmindImageGenerateConfig,
  responseTransforms: {
    imageGenerate: SegmindImageGenerateResponseTransform,
    imageToJson: SegmindImageToJsonResponseTransform,
  },
};

export default SegmindConfig;
