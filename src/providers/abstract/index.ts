import { ABSTRACT } from '../../globals';
import { ProviderConfigs } from '../types';
import AbstractAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';

const AbstractConfig: ProviderConfigs = {
  api: AbstractAPIConfig,
  chatComplete: chatCompleteParams([]),
  responseTransforms: responseTransformers(ABSTRACT, {
    chatComplete: true,
  }),
};

export default AbstractConfig;
