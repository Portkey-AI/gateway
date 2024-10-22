import { BEDROCK } from '../../globals';
import { StabilityAIImageGenerateV2Config } from '../stability-ai/imageGenerateV2';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';

export const BedrockStabilityAIImageGenerateV1Config: ProviderConfig = {
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
};

interface ImageArtifact {
  base64: string;
  finishReason: 'CONTENT_FILTERED' | 'ERROR' | 'SUCCESS';
  seed: number;
}

interface BedrockStabilityAIImageGenerateV1Response {
  result: string;
  artifacts: ImageArtifact[];
}

export const BedrockStabilityAIImageGenerateV1ResponseTransform: (
  response: BedrockStabilityAIImageGenerateV1Response | BedrockErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('artifacts' in response) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: response.artifacts.map((art) => ({ b64_json: art.base64 })),
      provider: BEDROCK,
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

interface BedrockStabilityAIImageGenerateV2Response {
  seeds: number[];
  finish_reasons: string[];
  images: string[];
}

export const BedrockStabilityAIImageGenerateV2Config =
  StabilityAIImageGenerateV2Config;

export const BedrockStabilityAIImageGenerateV2ResponseTransform: (
  response: BedrockStabilityAIImageGenerateV2Response | BedrockErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('images' in response) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: response.images.map((image) => ({ b64_json: image })),
      provider: BEDROCK,
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
