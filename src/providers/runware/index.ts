import { RUNWARE } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { RunwareAPIConfig } from './api';

export const RunwareProviderConfigs: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'qwen35_397b_a17b_fp8' }),
  api: RunwareAPIConfig,
  responseTransforms: responseTransformers(RUNWARE, {
    chatComplete: true,
  }),
};
