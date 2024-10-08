import { LEMONFOX_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';

import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const LemonfoxAIImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  negative_prompt: {
    param: 'negative_prompt',
  },
  n: {
    param: 'n',
    max: 8,
    min: 1,
    default: 1,
  },
  response_format: {
    param: 'response_format',
    default: 'url',
  },
  size: {
    param: 'size',
  },
};

interface LemonfoxAIImageObject {
  b64_json?: string; // The base64-encoded JSON of the generated image, if response_format is b64_json.
  url?: string; // The URL of the generated image, if response_format is url (default).
}

interface LemonfoxAIImageGenerateResponse extends ImageGenerateResponse {
  data: LemonfoxAIImageObject[];
}

export const LemonfoxImageGenerateResponseTransform: (
  response: LemonfoxAIImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return generateErrorResponse(
      {
        message: response['error'].message,
        type: response['error'].type,
        param: null,
        code: null,
      },
      LEMONFOX_AI
    );
  }

  return response;
};
