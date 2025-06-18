import { AZURE_AI_INFERENCE } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';

export const AzureAIInferenceResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return { ...response, AZURE_AI_INFERENCE };
};

export const AzureAIInferenceCreateSpeechResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return response;
};

export const AzureOpenAICreateTranscriptionResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return response;
};

export const AzureOpenAICreateTranslationResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return response;
};
