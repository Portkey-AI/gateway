import { OPENROUTER } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { OpenrouterErrorResponse } from './chatComplete';

export const OpenrouterEmbedConfig: ProviderConfig = {
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

interface OpenrouterEmbedResponse extends EmbedResponse {}

export const OpenrouterEmbedResponseTransform: (
  response: OpenrouterEmbedResponse | OpenrouterErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      OPENROUTER
    );
  }

  if ('data' in response) {
    return {
      object: response.object,
      data: response.data,
      model: response.model,
      usage: response.usage,
      provider: OPENROUTER,
    };
  }

  return generateInvalidProviderResponseError(response, OPENROUTER);
};
