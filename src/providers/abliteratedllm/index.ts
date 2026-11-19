import { ABLITERATEDLLM } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import AbliteratedLLMAPIConfig from './api';

const DEFAULT_MODEL = 'glm-5.3-flash-abliterated';

const AbliteratedLLMConfig: ProviderConfigs = {
  api: AbliteratedLLMAPIConfig,
  chatComplete: chatCompleteParams(
    [],
    undefined,
    {
      model: {
        param: 'model',
        required: true,
        default: DEFAULT_MODEL,
      },
    }
  ),
  complete: completeParams(
    [],
    { model: DEFAULT_MODEL },
    {
      stream_options: {
        param: 'stream_options',
      },
    }
  ),
  createModelResponse: createModelResponseParams(
    [],
    {},
    {
      model: {
        param: 'model',
        required: true,
        default: DEFAULT_MODEL,
      },
    }
  ),
  responseTransforms: {
    ...responseTransformers(ABLITERATEDLLM, {
      chatComplete: true,
      complete: true,
    }),
    createModelResponse: OpenAICreateModelResponseTransformer(ABLITERATEDLLM),
  },
};

export default AbliteratedLLMConfig;
