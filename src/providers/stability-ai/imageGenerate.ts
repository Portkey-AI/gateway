import { STABILITY_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const StabilityAIImageGenerateV1Config: ProviderConfig = {
  prompt: {
    param: 'text_prompts',
    required: true,
    transform: (params: any) => {
      return [
        {
          text: params.prompt,
          weight: 1,
        },
      ];
    },
  },
  n: {
    param: 'samples',
    min: 1,
    max: 10,
  },
  size: [
    {
      param: 'height',
      transform: (params: any) =>
        parseInt(params.size.toLowerCase().split('x')[1]),
      min: 320,
    },
    {
      param: 'width',
      transform: (params: any) =>
        parseInt(params.size.toLowerCase().split('x')[0]),
      min: 320,
    },
  ],
  style: {
    param: 'style_preset',
  },
  cfg_scale: {
    param: 'cfg_scale',
  },
  clip_guidance_preset: {
    param: 'clip_guidance_preset',
  },
  sampler: {
    param: 'sampler',
  },
  seed: {
    param: 'seed',
  },
  steps: {
    param: 'steps',
  },
  extras: {
    param: 'extras',
  },
};

interface StabilityAIImageGenerateV1Response extends ImageGenerateResponse {
  artifacts: ImageArtifact[];
}

interface StabilityAIImageGenerateV1ErrorResponse {
  id: string;
  name: string;
  message: string;
}

interface ImageArtifact {
  base64: string; // Image encoded in base64
  finishReason: 'CONTENT_FILTERED' | 'ERROR' | 'SUCCESS'; // Enum for finish reason
  seed: number; // The seed associated with this image
}

export const StabilityAIImageGenerateV1ResponseTransform: (
  response:
    | StabilityAIImageGenerateV1Response
    | StabilityAIImageGenerateV1ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'message' in response) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.name,
        param: null,
        code: null,
      },
      STABILITY_AI
    );
  }

  if ('artifacts' in response) {
    return {
      created: Math.floor(Date.now() / 1000), // Corrected method call
      data: response.artifacts.map((art) => ({ b64_json: art.base64 })), // Corrected object creation within map
      provider: STABILITY_AI,
    };
  }

  return generateInvalidProviderResponseError(response, STABILITY_AI);
};
