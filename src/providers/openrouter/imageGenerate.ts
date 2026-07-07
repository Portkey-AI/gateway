import { OPENROUTER } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const OpenrouterImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  n: {
    param: 'n',
    min: 1,
    max: 10,
  },
  size: {
    param: 'size',
  },
  seed: {
    param: 'seed',
  },
  aspect_ratio: {
    param: 'aspect_ratio',
  },
  resolution: {
    param: 'resolution',
  },
  input_references: {
    param: 'input_references',
  },
};

interface OpenrouterImageObject {
  b64_json?: string; // The base64-encoded image. OpenRouter always returns base64 (no URL support).
  media_type?: string; // The image MIME type, only present for non-PNG images.
}

interface OpenrouterImageGenerateResponse extends ImageGenerateResponse {
  data: OpenrouterImageObject[];
}

export const OpenrouterImageGenerateResponseTransform: (
  response: OpenrouterImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPENROUTER);
  }

  return response;
};
