import { Z_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const ZAIImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'cogview-4-250304',
  },
  n: {
    param: 'n',
    min: 1,
    max: 10,
  },
  size: {
    param: 'size',
  },
  response_format: {
    param: 'response_format',
  },
  user: {
    param: 'user_id',
  },
};

interface ZAIImageObject {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface ZAIImageGenerateResponse extends ImageGenerateResponse {
  data: ZAIImageObject[];
}

export const ZAIImageGenerateResponseTransform: (
  response: ZAIImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, Z_AI);
  }

  return response;
};
