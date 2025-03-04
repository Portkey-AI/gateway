import { OPEN_AI } from '../../globals';
import { ErrorResponse, GetChatMessagesResponse } from '../types';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIGetChatMessagesResponseTransform: (
  response: GetChatMessagesResponse | ErrorResponse,
  responseStatus: number
) => GetChatMessagesResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
