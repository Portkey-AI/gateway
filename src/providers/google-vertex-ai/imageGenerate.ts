import { GOOGLE_VERTEX_AI } from '../../globals';
import { Params } from '../../types/requestBody';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleErrorResponse } from './types';
import { GoogleErrorResponseTransform } from './utils';

interface GoogleImageGenInstanceData {
  prompt: string;
}

const transformParams = (params: Record<string, unknown>) => {
  const config: Record<string, unknown> = {};
  if (params['n']) {
    config['sampleCount'] = params['n'];
  }
  if (params['quality']) {
    let quality;
    if (typeof params['quality'] === 'number') {
      quality = params['quality'];
    } else {
      if (params['quality'] === 'hd') {
        quality = 100;
      } else {
        quality = 75;
      }
    }
    if (config['outputOptions']) {
      (config['outputOptions'] as any)['compressionQuality'] = quality;
    } else {
      config['outputOptions'] = { compressionQuality: quality };
    }
  }
  if (params['style']) {
    config['sampleImageStyle'] = params['style'];
  }

  if (params['aspectRatio']) {
    config['aspectRatio'] = params['aspectRatio'];
  }
  if (params['seed']) {
    config['seed'] = params['seed'];
  }
  if (params['negativePrompt']) {
    config['negativePrompt'] = params['negativePrompt'];
  }
  if (params['personGeneration']) {
    config['personGeneration'] = params['personGeneration'];
  }
  if (params['safetySetting']) {
    config['safetySetting'] = params['safetySetting'];
  }
  if (params['addWatermark']) {
    config['addWatermark'] = params['addWatermark'];
  }
  if (params['mimeType']) {
    if (config['outputOptions']) {
      (config['outputOptions'] as any)['mimeType'] = params['mimeType'];
    } else {
      config['outputOptions'] = { mimeType: params['mimeType'] };
    }
  }

  return config;
};

export const GoogleImageGenConfig: ProviderConfig = {
  prompt: {
    param: 'instances',
    required: true,
    transform: (params: Params): Array<GoogleImageGenInstanceData> => {
      const instances = Array<GoogleImageGenInstanceData>();
      if (Array.isArray(params.prompt)) {
        params.prompt.forEach((text) => {
          instances.push({
            prompt: text,
          });
        });
      } else {
        instances.push({
          prompt: params.prompt as string,
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
  style: {
    param: 'parameters',
    transform: transformParams,
  },
  aspectRatio: {
    param: 'parameters',
    transform: transformParams,
  },
  seed: {
    param: 'parameters',
    transform: transformParams,
  },
  negativePrompt: {
    param: 'parameters',
    transform: transformParams,
  },
  personGeneration: {
    param: 'parameters',
    transform: transformParams,
  },
  safetySetting: {
    param: 'parameters',
    transform: transformParams,
  },
  addWatermark: {
    param: 'parameters',
    transform: transformParams,
  },
  mimeType: {
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
      created: Math.floor(Date.now() / 1000),
      data: response.predictions.map((generation) => ({
        b64_json: generation.bytesBase64Encoded,
      })),
      provider: GOOGLE_VERTEX_AI,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
