import { TRITON } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

// Triton's OpenAI-compatible frontend exposes /v1/embeddings and returns the
// same shape OpenAI does, so the request params and response map straight over.
export const TritonEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  input: {
    param: 'input',
    required: true,
  },
  encoding_format: {
    param: 'encoding_format',
  },
  user: {
    param: 'user',
  },
};

interface TritonEmbedResponse extends EmbedResponse {}

interface TritonEmbedErrorResponse {
  error: string;
}

export const TritonEmbedResponseTransform: (
  response: TritonEmbedResponse | TritonEmbedErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return generateErrorResponse(
      { message: response.error, type: null, param: null, code: null },
      TRITON
    );
  }

  if ('data' in response) {
    return {
      object: response.object,
      data: response.data.map((d) => ({
        object: d.object,
        index: d.index,
        embedding: d.embedding,
      })),
      provider: TRITON,
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};
