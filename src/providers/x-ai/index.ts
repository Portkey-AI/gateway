import { ProviderConfigs } from '../types';
import { X_AI } from '../../globals';
import XAIAPIConfig from './api';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';

interface XAIErrorResponse {
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

const xAIResponseTransform = <T>(response: T) => {
  let _response = response as XAIErrorResponse;
  if ('error' in _response) {
    return {
      error: {
        message: _response.error as string,
        code: _response.code ?? null,
        param: null,
        type: null,
      },
      provider: X_AI,
    };
  }
  return response;
};

const XAIConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams([], { model: 'grok-beta' }),
  complete: completeParams([], { model: 'grok-beta' }),
  embed: embedParams([], { model: 'v1' }),
  api: XAIAPIConfig,
  responseTransforms: responseTransformers(X_AI, {
    chatComplete: xAIResponseTransform,
    complete: xAIResponseTransform,
    embed: xAIResponseTransform,
  }),
};

export default XAIConfig;
