import { ProviderConfigs } from '../types';
import { Z_AI } from '../../globals';
import ZAIAPIConfig from './api';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';

interface ZAIErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

const zAIResponseTransform = <T>(response: T) => {
  let _response = response as ZAIErrorResponse;
  if ('message' in _response && 'object' in _response && 'code' in _response) {
    return {
      error: {
        message: _response.message,
        code: _response.code,
        param: _response.param,
        type: _response.type,
      },
      provider: Z_AI,
    };
  }
  return response;
};

const ZAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'glm-3-turbo' }),
  complete: completeParams([], { model: 'glm-3-turbo' }),
  api: ZAIAPIConfig,
  responseTransforms: responseTransformers(Z_AI, {
    chatComplete: zAIResponseTransform,
    complete: zAIResponseTransform,
  }),
};

export default ZAIConfig;
