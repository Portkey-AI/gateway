import { WORKERS_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  WorkersAiErrorResponse,
  WorkersAiErrorResponseTransform,
} from './utils';

interface WorkersAiImageGenerateResponse extends ImageGenerateResponse {
  result: {
    image?: string;
  };
  success: boolean;
  errors: string[];
  messages: string[];
}

export const WorkersAiImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  negative_prompt: {
    param: 'negative_prompt',
  },
  steps: [
    {
      param: 'num_steps',
    },
    {
      param: 'steps',
    },
  ],
  size: [
    {
      param: 'height',
      transform: (params: any) =>
        parseInt(params.size.toLowerCase().split('x')[1]),
    },
    {
      param: 'width',
      transform: (params: any) =>
        parseInt(params.size.toLowerCase().split('x')[0]),
    },
  ],
  seed: {
    param: 'seed',
  },
};

export const WorkersAiImageGenerateResponseTransform: (
  response: WorkersAiImageGenerateResponse | WorkersAiErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = WorkersAiErrorResponseTransform(
      response as WorkersAiErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  // the imageGenerate response is not always the same for all Cloudflare image models
  // we currently only support the image model that returns a base64 image
  if ('result' in response && 'image' in response.result) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: [
        {
          b64_json: response.result.image,
        },
      ],
      provider: WORKERS_AI,
    };
  }

  return generateInvalidProviderResponseError(response, WORKERS_AI);
};
