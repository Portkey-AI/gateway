import { TOKENLAB } from '../../globals';
import {
  chatCompleteParams,
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIDeleteModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
  OpenAIListInputItemsResponseTransformer,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import TokenLabAPIConfig from './api';

const TokenLabConfig: ProviderConfigs = {
  api: TokenLabAPIConfig,
  chatComplete: chatCompleteParams([], { model: 'gpt-5.4-mini' }),
  createModelResponse: createModelResponseParams([]),
  getModelResponse: {},
  deleteModelResponse: {},
  listResponseInputItems: {},
  responseTransforms: {
    ...responseTransformers(TOKENLAB, { chatComplete: true }),
    createModelResponse: OpenAICreateModelResponseTransformer(TOKENLAB),
    getModelResponse: OpenAIGetModelResponseTransformer(TOKENLAB),
    deleteModelResponse: OpenAIDeleteModelResponseTransformer(TOKENLAB),
    listResponseInputItems: OpenAIListInputItemsResponseTransformer(TOKENLAB),
  },
};

export default TokenLabConfig;
