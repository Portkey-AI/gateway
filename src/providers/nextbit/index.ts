import { NEXTBIT } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { nextBitAPIConfig } from './api';

export const NextBitConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'microsoft:phi-4' }),
  complete: completeParams([], { model: 'microsoft:phi-4' }),
  api: nextBitAPIConfig,
  responseTransforms: responseTransformers(NEXTBIT, {
    chatComplete: true,
    complete: true,
  }),
};
