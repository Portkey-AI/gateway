import { GOOGLE_VERTEX_AI } from '../../globals';
import { MessagesResponse } from '../../types/messagesResponse';
import { getMessagesConfig } from '../anthropic-base/messages';
import { AnthropicErrorResponse } from '../anthropic/types';
import { AnthropicErrorResponseTransform } from '../anthropic/utils';
import { ErrorResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const VertexAnthropicMessagesConfig = getMessagesConfig({
  extra: {
    anthropic_version: {
      param: 'anthropic_version',
      required: true,
      default: 'vertex-2023-10-16',
    },
  },
  exclude: ['model'],
});

export const VertexAnthropicMessagesResponseTransform = (
  response: MessagesResponse | AnthropicErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResposne = AnthropicErrorResponseTransform(
      response as AnthropicErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('model' in response) return response;

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
