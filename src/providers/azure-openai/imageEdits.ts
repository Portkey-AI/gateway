import { AZURE_OPEN_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';

export const AzureOpenAIImageEditConfig: ProviderConfig = {
  image: {
    param: 'image',
    required: true,
  },
  prompt: {
    param: 'prompt',
    required: true,
  },
  background: {
    param: 'background',
  },
  input_fidelity: {
    param: 'input_fidelity',
  },
  mask: {
    param: 'mask',
  },
  model: {
    param: 'model',
    default: 'dall-e-2',
  },
  n: {
    param: 'n',
    min: 1,
    max: 10,
  },
  output_compression: {
    param: 'output_compression',
    min: 0,
    max: 100,
  },
  output_format: {
    param: 'output_format',
  },
  partial_images: {
    param: 'partial_images',
    min: 0,
    max: 3,
  },
  quality: {
    param: 'quality',
  },
  response_format: {
    param: 'response_format',
  },
  size: {
    param: 'size',
  },
  stream: {
    param: 'stream',
  },
  user: {
    param: 'user',
  },
};

interface AzureOpenAIImageObject {
  b64_json?: string; // The base64-encoded JSON of the generated image, if response_format is b64_json.
  url?: string; // The URL of the generated image, if response_format is url (default).
  revised_prompt?: string; // The prompt that was used to generate the image, if there was any revision to the prompt.
}

interface AzureOpenAIImageGenerateResponse extends ImageGenerateResponse {
  data: AzureOpenAIImageObject[];
}

export const AzureOpenAIImageEditResponseTransform: (
  response: AzureOpenAIImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_OPEN_AI);
  }

  return response;
};
