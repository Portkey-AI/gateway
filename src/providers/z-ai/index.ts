import { ProviderConfigs } from '../types';
import { Z_AI } from '../../globals';
import ZAIAPIConfig from './api';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';

interface ZAIErrorResponse {
  error:
    | {
        message: string;
        code: string;
        param: string | null;
        type: string | null;
      }
    | string;
  code?: string;
}

const zAIResponseTransform = <T>(response: T) => {
  let _response = response as ZAIErrorResponse;
  if ('error' in _response) {
    return {
      error: {
        message: _response.error as string,
        code: _response.code ?? null,
        param: null,
        type: null,
      },
      provider: Z_AI,
    };
  }
  return response;
};

const ZAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'glm-4.6' }),
  api: ZAIAPIConfig,
  responseTransforms: responseTransformers(Z_AI, {
    chatComplete: zAIResponseTransform,
  }),
};

export default ZAIConfig;
