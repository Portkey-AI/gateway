import { TRITON } from '../../globals';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const TritonEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
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

interface TritonEmbedResponse extends EmbedResponse {}

interface TritonEmbedErrorResponse {
  error: string;
}

const TritonEmbedErrorResponseTransform: (
  response: TritonEmbedErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('error' in response) {
    return generateErrorResponse(
      { message: response.error, type: null, param: null, code: null },
      TRITON
    );
  }
  return undefined;
};

export const TritonEmbedResponseTransform: (
  response: TritonEmbedResponse | TritonEmbedErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = TritonEmbedErrorResponseTransform(
      response as TritonEmbedErrorResponse
    );
    if (errorResponse) return errorResponse;
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
      provider: TRITON,
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};
