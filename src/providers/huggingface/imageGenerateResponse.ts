import { ImageGenerateResponse, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { HUGGING_FACE } from '../../globals';

export const HuggingFaceImageGenerateResponseTransform = (
  response: any,
  responseStatus: number,
  headers?: Record<string, string>
): ImageGenerateResponse | ErrorResponse => {
  // HF JSON error response
  if (
    responseStatus !== 200 &&
    typeof response === 'object' &&
    response?.error
  ) {
    return generateErrorResponse(
      {
        message: response.error,
        type: 'HF_IMAGE_ERROR',
        param: null,
        code: null,
      },
      HUGGING_FACE
    );
  }

  const contentType = headers?.['content-type'] || headers?.['Content-Type'];

  // Binary image response
  if (responseStatus === 200 && contentType?.includes('image')) {
    if (!response) {
      return generateInvalidProviderResponseError(response, HUGGING_FACE);
    }

    const base64Image = Buffer.isBuffer(response)
      ? response.toString('base64')
      : Buffer.from(response).toString('base64');

    return {
      created: Math.floor(Date.now() / 1000),
      data: [
        {
          b64_json: base64Image,
        },
      ],
      provider: HUGGING_FACE,
    };
  }

  return generateInvalidProviderResponseError(response, HUGGING_FACE);
};
