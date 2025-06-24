import { HYPERBOLIC } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const HyperbolicImageGenerateConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  prompt: {
    param: 'prompt',
    required: true,
  },
  height: {
    param: 'height',
  },
  width: {
    param: 'width',
  },
  backend: {
    param: 'backend',
  },
};

interface HyperbolicImageObject {
  url?: string;
  b64_json?: string;
  seed?: number;
}

interface HyperbolicImageGenerateResponse {
  images: HyperbolicImageObject[];
  model: string;
  prompt: string;
}

export const HyperbolicImageGenerateResponseTransform: (
  response: HyperbolicImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => HyperbolicImageGenerateResponse | ErrorResponse = (
  response,
  responseStatus
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, HYPERBOLIC);
  }

  return response;
};
