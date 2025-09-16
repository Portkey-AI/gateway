import { AZURE_OPEN_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse, ImageGenerateResponse } from '../types';

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
