import { GOOGLE_VERTEX_AI } from '../../globals';
import { EmbedParams } from '../../types/embedRequestBody';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { GoogleErrorResponse } from './types';
import { GoogleErrorResponseTransform } from './utils';

interface GoogleImageGenParams extends EmbedParams {}

interface GoogleImageGenInstanceData {
  prompt: string;
}

export const GoogleImageGenConfig: ProviderConfig = {
  input: {
    param: 'instances',
    required: true,
    transform: (
      params: GoogleImageGenParams
    ): Array<GoogleImageGenInstanceData> => {
      const instances = Array<GoogleImageGenInstanceData>();
      if (Array.isArray(params.input)) {
        params.input.forEach((text) => {
          instances.push({
            prompt: text,
          });
        });
      } else {
        instances.push({
          prompt: params.input,
        });
      }
      return instances;
    },
  },
  parameters: {
    param: 'parameters',
    required: true,
    default: { sampleCount: 1 },
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
