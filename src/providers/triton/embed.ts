import { TRITON } from '../../globals';
import { EmbedParams, EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

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
};

export const TritonEmbedResponseTransform: (
  response: any,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return {
      error: {
        message: response?.error || 'Unknown error',
        type: null,
        param: null,
        code: null,
      },
      provider: TRITON,
    };
  }

  // Handle Triton V2 Inference API response (KFServing format)
  if (response?.outputs) {
    const embeddingOutput = response.outputs.find(
      (o: any) => o.name === 'embedding'
    );
    if (embeddingOutput?.data) {
      return {
        object: 'list',
        data: [
          {
            object: 'embedding',
            embedding: embeddingOutput.data,
            index: 0,
          },
        ],
        model: response.model_name || '',
        usage: {
          prompt_tokens: -1,
          total_tokens: -1,
        },
      };
    }
  }

  // If response is already OpenAI-compatible (e.g. via Triton Python backend wrapper)
  if (response?.data) {
    return {
      ...response,
      provider: TRITON,
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};
