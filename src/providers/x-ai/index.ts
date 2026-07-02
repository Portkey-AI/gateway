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
    const error = _response.error;
    const isStructuredError = typeof error === 'object' && error !== null;
    return {
      error: {
        message: isStructuredError ? error.message : (error as string),
        code: (isStructuredError ? error.code : _response.code) ?? null,
        param: isStructuredError ? error.param : null,
        type: isStructuredError ? error.type : null,
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
