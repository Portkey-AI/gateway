import { OPEN_AI } from '../../globals';
import { ErrorResponse, ImageGenerateResponse } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

interface OpenAIImageObject {
  b64_json?: string; // The base64-encoded JSON of the generated image, if response_format is b64_json.
  url?: string; // The URL of the generated image, if response_format is url (default).
  revised_prompt?: string; // The prompt that was used to generate the image, if there was any revision to the prompt.
}

interface OpenAIImageGenerateResponse extends ImageGenerateResponse {
  data: OpenAIImageObject[];
}

export const OpenAIImageEditResponseTransform: (
  response: OpenAIImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
