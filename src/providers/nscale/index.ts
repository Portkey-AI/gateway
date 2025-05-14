import { ProviderConfigs } from '../types';
import NscaleAPIConfig from './api';
import { NscaleChatCompleteConfig } from './chatComplete';
import {
  NscaleImageGenerateConfig,
  NscaleImageGenerateResponseTransform,
} from './imageGenerate';
import { responseTransformers } from '../open-ai-base';
import { NSCALE } from '../../globals';

const NscaleConfig: ProviderConfigs = {
  chatComplete: NscaleChatCompleteConfig,
  imageGenerate: NscaleImageGenerateConfig,
  api: NscaleAPIConfig,
  responseTransforms: {
    ...responseTransformers(NSCALE, { chatComplete: true }),
    imageGenerate: NscaleImageGenerateResponseTransform,
  },
};

export default NscaleConfig;
