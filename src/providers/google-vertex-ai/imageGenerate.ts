import { GOOGLE_VERTEX_AI } from '../../globals';
import { EmbedParams } from '../../types/embedRequestBody';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleErrorResponse } from './types';
import { GoogleErrorResponseTransform } from './utils';

interface GoogleImageGenParams {
  prompt: string;
  model: string;
  n: number;
  style: string;
  user?: string;
}

interface GoogleImageGenInstanceData {
  prompt: string;
}

const transformParams = (params: Record<string, unknown>) => {
  const config: Record<string, unknown> = {};
  if (params['n']) {
    config['sampleCount'] = params['n'];
  }
  if (params['quality']) {
    if (config['outputOptions']) {
      const quality = params['quality'] === 'hd' ? 100 : 75;
      (config['outputOptions'] as any)['compressionQuality'] = quality;
    }
  }
  if (params['style']) {
    config['sampleImageStyle'] = params['style'];
  }
  if (params['size']) {
    config['aspectRatio'] = params['size'] as string;
  }

  return config;
};

export const GoogleImageGenConfig: ProviderConfig = {
  prompt: {
    param: 'instances',
    required: true,
    transform: (
      params: GoogleImageGenParams
    ): Array<GoogleImageGenInstanceData> => {
      const instances = Array<GoogleImageGenInstanceData>();
      if (Array.isArray(params.prompt)) {
        params.prompt.forEach((text) => {
          instances.push({
            prompt: text,
          });
        });
      } else {
        instances.push({
          prompt: params.prompt,
        });
      }
      return instances;
    },
  },
  n: {
    param: 'parameters',
    min: 1,
    max: 8,
    transform: transformParams,
  },
  quality: {
    param: 'parameters',
    transform: transformParams,
  },
  size: {
    param: 'parameters',
    transform: transformParams,
  },
  style: {
    param: 'parameters',
    transform: transformParams,
  },
};

interface GoogleImageGenResponse {
  predictions: Array<{
    bytesBase64Encoded?: string;
    mimeType: string;
    raiFilteredReason?: string;
    safetyAttributes: {
      categories: string | string[];
      scores: any;
    };
  }>;
}

export const GoogleImageGenResponseTransform: (
  response: GoogleImageGenResponse | GoogleErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = GoogleErrorResponseTransform(
      response as GoogleErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('predictions' in response) {
    return {
      created: `${new Date().getTime()}`,
      data: response.predictions.map((generation) => ({
        b64_json: generation.bytesBase64Encoded,
      })),
      provider: GOOGLE_VERTEX_AI,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
