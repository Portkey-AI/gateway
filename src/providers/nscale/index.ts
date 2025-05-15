import { ProviderConfigs } from '../types';
import NscaleAPIConfig from './api';
import {
  NscaleImageGenerateConfig,
  NscaleImageGenerateResponseTransform,
} from './imageGenerate';
import { responseTransformers } from '../open-ai-base';
import { NSCALE } from '../../globals';
import { chatCompleteParams } from '../open-ai-base';

const NscaleConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([
    'functions',
    'function_call',
    'user',
    'seed',
    'tools',
    'tool_choice',
    'stream_options',
  ]),
  imageGenerate: NscaleImageGenerateConfig,
  api: NscaleAPIConfig,
  responseTransforms: {
    ...responseTransformers(NSCALE, { chatComplete: true }),
    imageGenerate: NscaleImageGenerateResponseTransform,
  },
};

export default NscaleConfig;
