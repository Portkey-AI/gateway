import { MODELSELL } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { ProviderConfigs } from '../types';
import ModelsellAPIConfig from './api';

const ModelsellConfig: ProviderConfigs = {
  api: ModelsellAPIConfig,
  chatComplete: chatCompleteParams([]),
  responseTransforms: responseTransformers(MODELSELL, {
    chatComplete: true,
  }),
};

export default ModelsellConfig;
