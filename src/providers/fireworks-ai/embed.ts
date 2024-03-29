import { FIREWORKS_AI } from '../../globals';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { FireworksAIErrorResponse } from './chatComplete';

export const FireworksAIEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'nomic-ai/nomic-embed-text-v1.5',
  },
  input: {
    param: 'input',
    required: true,
    transform: (params: EmbedParams) => {
      if (Array.isArray(params.input)) {
        return params.input;
      }

      return [params.input];
    },
  },
};

interface FireworksAIEmbedResponse extends EmbedResponse {}

export const FireworksAIEmbedResponseTransform: (
  response: FireworksAIEmbedResponse | FireworksAIErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if ('fault' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.fault.faultstring,
        type: null,
        param: null,
        code: response.fault.detail.errorcode,
      },
      FIREWORKS_AI
    );
  }

  if ('data' in response) {
    return {
      object: response.object,
      data: response.data.map((d) => ({
        object: d.object,
        embedding: d.embedding,
        index: d.index,
      })),
      model: response.model,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        total_tokens: response.usage.total_tokens,
      },
      provider: FIREWORKS_AI,
    };
  }

  return generateInvalidProviderResponseError(response, FIREWORKS_AI);
};
