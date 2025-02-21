import { OPEN_AI } from '../../globals';
import { ErrorResponse } from '../types';
import { OpenAIChatCompleteResponse } from './chatComplete';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIGetChatCompletionResponseTransform: (
  response: OpenAIChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => OpenAIChatCompleteResponse | ErrorResponse = (
  response,
  responseStatus
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
