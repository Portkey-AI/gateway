import { MessagesResponse } from '../../types/messagesResponse';
import { getMessagesConfig } from '../anthropic-base/messages';
import { AnthropicErrorResponse } from './types';
import { ErrorResponse } from '../types';
import { AnthropicErrorResponseTransform } from './utils';
import { generateInvalidProviderResponseError } from '../utils';
import { ANTHROPIC } from '../../globals';

export const AnthropicMessagesConfig = getMessagesConfig({});

export const AnthropicMessagesResponseTransform = (
  response: MessagesResponse | AnthropicErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return AnthropicErrorResponseTransform(response);
  }

  if ('model' in response) return response;

  return generateInvalidProviderResponseError(response, ANTHROPIC);
};
