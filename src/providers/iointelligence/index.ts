import { ProviderConfigs } from '../types';
import IOIntelligenceAPIConfig from './api';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
  createModelResponseParams,
} from '../open-ai-base';
import { IO_INTELLIGENCE } from '../../globals';

const IOIntelligenceConfig: ProviderConfigs = {
  api: IOIntelligenceAPIConfig,
  chatComplete: chatCompleteParams([]),
  embed: embedParams([]),
  createModelResponse: createModelResponseParams([]),
  getModelResponse: {},
  listModelsResponse: {},
  responseTransforms: {
    ...responseTransformers(IO_INTELLIGENCE, {
      chatComplete: true,
      embed: true,
    }),
  },
};

export default IOIntelligenceConfig;
