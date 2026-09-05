import { THEGRID } from '../../globals';
import {
  chatCompleteParams,
  createModelResponseParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { theGridAPIConfig } from './api';

export const TheGridConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'text-standard' }),
  createModelResponse: createModelResponseParams([]),
  api: theGridAPIConfig,
  responseTransforms: {
    ...responseTransformers(THEGRID, {
      chatComplete: true,
    }),
  },
};

export default TheGridConfig;
