import { LOCAL_AI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { LocalAIErrorResponseTransform } from './chatComplete';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const LocalAIEmbedConfig: ProviderConfig = {
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

interface LocalAIEmbedResponse extends EmbedResponse {}

export const LocalAIEmbedResponseTransform: (
  response: LocalAIEmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return LocalAIErrorResponseTransform(response, LOCAL_AI);
  }

  return response;
};
