import { TRITON } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { TritonOpenAIErrorResponseTransform } from './utils';

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
  dimensions: {
    param: 'dimensions',
  },
  user: {
    param: 'user',
  },
};

interface TritonEmbedResponse extends EmbedResponse {}

export const TritonEmbedResponseTransform: (
  response: TritonEmbedResponse | Record<string, any>,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = TritonOpenAIErrorResponseTransform(response);
    if (errorResponse) return errorResponse;
  }

  if ('data' in response && Array.isArray(response.data)) {
    return {
      object: response.object,
      data: response.data.map((item) => ({
        object: item.object,
        embedding: item.embedding,
        index: item.index,
      })),
      model: response.model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
      provider: TRITON,
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};
