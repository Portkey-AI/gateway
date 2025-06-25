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

  return { ...response, provider: AZURE_AI_INFERENCE };
};

export const AzureAIInferenceCreateSpeechResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return { ...response, provider: AZURE_AI_INFERENCE };
};

export const AzureAIInferenceCreateTranscriptionResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return { ...response, provider: AZURE_AI_INFERENCE };
};

export const AzureAIInferenceCreateTranslationResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, AZURE_AI_INFERENCE);
  }

  return { ...response, provider: AZURE_AI_INFERENCE };
};
