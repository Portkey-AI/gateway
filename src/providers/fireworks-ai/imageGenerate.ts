import { OPEN_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import {
  FireworksAIErrorResponse,
  FireworksAIErrorResponseTransform,
} from './chatComplete';

export const FireworksAIImageGenerateConfig: ProviderConfig = {
  text_prompts: {
    param: 'text_prompts',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'stable-diffusion-xl-1024-v1-0',
  },
  height: {
    param: 'height',
    min: 512,
    max: 1024,
    default: 1024,
  },
  width: {
    param: 'width',
    min: 512,
    max: 1024,
    default: 1024,
  },
  cfg_scale: {
    param: 'cfg_scale',
    default: 7,
  },
  sampler: {
    param: 'sampler',
  },
  samples: {
    param: 'samples',
    min: 1,
    max: 10,
    default: 1,
  },
  seed: {
    param: 'seed',
    min: 0,
    max: 4294967295,
  },
  steps: {
    param: 'steps',
    min: 10,
    max: 150,
    default: 50,
  },
  safety_check: {
    param: 'safety_check',
  },
  lora_adapter_name: {
    param: 'lora_adapter_name',
  },
  lora_weight_filename: {
    param: 'lora_weight_filename',
  },
};

interface FireworksAIImageObject {
  b64_json?: string; // The base64-encoded JSON of the generated image, if response_format is b64_json.
  url?: string; // The URL of the generated image, if response_format is url (default).
  revised_prompt?: string; // The prompt that was used to generate the image, if there was any revision to the prompt.
}

interface FireworksAIImageGenerateResponse extends ImageGenerateResponse {
  data: FireworksAIImageObject[];
}

export const FireworksAIImageGenerateResponseTransform: (
  response: FireworksAIImageGenerateResponse | FireworksAIErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if ('fault' in response) {
    return FireworksAIErrorResponseTransform(response);
  }

  return response;
};
