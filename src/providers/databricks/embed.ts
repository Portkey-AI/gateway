import { OPEN_AI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'text-embedding-ada-002',
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

interface OpenAIEmbedResponse extends EmbedResponse {}

export const OpenAIEmbedResponseTransform: (
  response: OpenAIEmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
