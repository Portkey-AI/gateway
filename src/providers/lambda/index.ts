import { LAMBDA } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { LambdaAPIConfig } from './api';

export const LambdaProviderConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'Liquid-AI-40B' }),
  complete: completeParams([], { model: 'Liquid-AI-40B' }),
  api: LambdaAPIConfig,
  responseTransforms: responseTransformers(LAMBDA, {
    chatComplete: true,
    complete: true,
  }),
};
