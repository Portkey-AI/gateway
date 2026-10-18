import { ABSTRACT } from '../../globals';
import { ProviderConfigs } from '../types';
import AbstractAPIConfig from './api';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
} from '../open-ai-base';

const AbstractConfig: ProviderConfigs = {
  api: AbstractAPIConfig,
  createModelResponse: createModelResponseParams([]),
  getModelResponse: {},
  responseTransforms: {
    createModelResponse: OpenAICreateModelResponseTransformer(ABSTRACT),
    getModelResponse: OpenAIGetModelResponseTransformer(ABSTRACT),
  },
};

export default AbstractConfig;
