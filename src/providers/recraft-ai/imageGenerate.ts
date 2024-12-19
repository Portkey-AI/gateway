import { RECRAFTAI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';

export const RecraftAIImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  style: {
    param: 'style',
    default: 'digital_illustration',
  },
  width: {
    param: 'width',
    default: 1024,
    min: 256,
    max: 2048,
  },
  height: {
    param: 'height',
    default: 1024,
    min: 256,
    max: 2048,
  },
  num_images: {
    param: 'num_images',
    default: 1,
    min: 1,
    max: 4,
  },
};

interface RecraftApiResponse {
  created: number;
  data: { url: string }[];
  error?: {
    message: string;
    type?: string;
    param?: string;
    code?: string;
  };
}

export const RecraftAIImageGenerateResponseTransform = (
  response: RecraftApiResponse,
  responseStatus: number
): ImageGenerateResponse | ErrorResponse => {
  if (responseStatus !== 200 || response.error) {
    const error = response.error || {
      message: 'Unknown error occurred',
      type: null,
      param: null,
      code: null,
    };

    return {
      error: {
        message: error.message,
        type: error.type || null,
        param: error.param || null,
        code: error.code || null,
      },
      provider: RECRAFTAI,
    };
  }

  if (!response.data || !Array.isArray(response.data)) {
    return {
      error: {
        message: 'Invalid response format from Recraft API',
        type: 'invalid_response',
        param: null,
        code: null,
      },
      provider: RECRAFTAI,
    };
  }

  return {
    created: response.created,
    data: response.data,
    provider: RECRAFTAI,
  };
};
