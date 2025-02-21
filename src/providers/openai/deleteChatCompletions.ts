import { OPEN_AI } from '../../globals';
import { ErrorResponse, DeleteChatCompletionResponse } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIDeleteChatCompletionResponseTransform: (
  response: DeleteChatCompletionResponse | ErrorResponse,
  responseStatus: number
) => DeleteChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
