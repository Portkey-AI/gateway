import { VOYAGE } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const VoyageMultimodalEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  inputs: {
    param: 'inputs',
    required: true,
  },
  input_type: {
    param: 'input_type',
    default: null,
    required: false,
  },
  truncation: {
    param: 'truncation',
    default: true,
    required: false,
  },
  output_encoding: {
    param: 'output_encoding',
    required: false,
    default: null,
  },
};

interface VoyageMultimodalEmbedResponse {
  object: 'list';
  data: Array<{ object: 'embedding'; embedding: number[]; index: number }>;
  model: string;
  usage: {
    text_tokens: number;
    image_pixels: number;
    total_tokens: number;
  };
}

export interface VoyageValidationErrorResponse {
  detail: string;
}

export const VoyageErrorResponseTransform: (
  response: VoyageValidationErrorResponse | any
) => ErrorResponse = (response) => {
  let errorField: string | null = null;

  let errorMessage = response.detail;
  let errorType = 'Invalid Request';

  return generateErrorResponse(
    {
      message: `${errorField ? `${errorField}: ` : ''}${errorMessage}`,
      type: errorType,
      param: null,
      code: null,
    },
    VOYAGE
  );
};

export const VoyageMultimodalEmbedResponseTransform: (
  response: VoyageMultimodalEmbedResponse | VoyageValidationErrorResponse | any,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if ('detail' in response && responseStatus !== 200) {
    return VoyageErrorResponseTransform(response);
  }

  if ('data' in response) {
    return {
      object: 'list',
      data: response.data,
      model: response.model,
      usage: {
        text_tokens: response.usage.text_tokens,
        image_pixels: response.usage.image_pixels,
        prompt_tokens: response.usage.total_tokens,
        total_tokens: response.usage.total_tokens,
      },
      provider: VOYAGE,
    };
  }

  return generateInvalidProviderResponseError(response, VOYAGE);
};
