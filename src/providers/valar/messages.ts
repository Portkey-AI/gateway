import { VALAR } from '../../globals';
import { MessagesResponse } from '../../types/messagesResponse';
import { getMessagesConfig } from '../anthropic-base/messages';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const ValarMessagesConfig = getMessagesConfig({
  // Server-side tool containers and MCP servers are not served, and scheduling
  // is governed by the completion window rather than `service_tier`.
  exclude: ['container', 'mcp_servers', 'service_tier'],
  extra: {
    // Valar's own extension: structured outputs (`format`) and reasoning depth
    // (`effort`) on the Anthropic-compatible surface.
    output_config: {
      param: 'output_config',
      required: false,
    },
  },
});

export const ValarMessagesResponseTransform = (
  response: MessagesResponse | ErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  // Unlike Anthropic, Valar returns errors in the OpenAI error envelope on
  // every surface, this one included.
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, VALAR);
  }

  if ('model' in response) return response;

  return generateInvalidProviderResponseError(response, VALAR);
};
