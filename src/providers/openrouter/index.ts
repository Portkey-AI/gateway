import { ProviderConfigs } from '../types';
import OpenrouterAPIConfig from './api';
import {
  OpenrouterChatCompleteConfig,
  OpenrouterChatCompleteResponseTransform,
  OpenrouterChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
  OpenAIDeleteModelResponseTransformer,
  OpenAIListInputItemsResponseTransformer,
} from '../open-ai-base';
import { OPENROUTER } from '../../globals';

const OpenrouterConfig: ProviderConfigs = {
  chatComplete: OpenrouterChatCompleteConfig,
  api: OpenrouterAPIConfig,
  createModelResponse: createModelResponseParams(
    [],
    {},
    {
      provider: {
        param: 'provider',
        required: false,
      },
      plugins: {
        param: 'plugins',
        required: false,
      },
      top_k: {
        param: 'top_k',
        required: false,
      },
      frequency_penalty: {
        param: 'frequency_penalty',
        required: false,
      },
      presence_penalty: {
        param: 'presence_penalty',
        required: false,
      },
      session_id: {
        param: 'session_id',
        required: false,
      },
      trace: {
        param: 'trace',
        required: false,
      },
    }
  ),
  getModelResponse: {},
  deleteModelResponse: {},
  listModelsResponse: {},
  responseTransforms: {
    chatComplete: OpenrouterChatCompleteResponseTransform,
    'stream-chatComplete': OpenrouterChatCompleteStreamChunkTransform,
    createModelResponse: OpenAICreateModelResponseTransformer(OPENROUTER),
    getModelResponse: OpenAIGetModelResponseTransformer(OPENROUTER),
    deleteModelResponse: OpenAIDeleteModelResponseTransformer(OPENROUTER),
    listModelsResponse: OpenAIListInputItemsResponseTransformer(OPENROUTER),
  },
};

export default OpenrouterConfig;
