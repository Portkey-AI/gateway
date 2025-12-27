import { AZURE_AI_INFERENCE } from '../../globals';
import { MessagesResponse } from '../../types/messagesResponse';
import { getMessagesConfig } from '../anthropic-base/messages';
import { AnthropicErrorResponse } from '../anthropic/types';
import { AnthropicErrorResponseTransform } from '../anthropic/utils';
import { ErrorResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const AzureAIInferenceMessagesConfig = getMessagesConfig({});

export const AzureAIInferenceMessagesResponseTransform = (
  response: MessagesResponse | AnthropicErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResposne = AnthropicErrorResponseTransform(
      response as AnthropicErrorResponse,
      AZURE_AI_INFERENCE
    );
    if (errorResposne) return errorResposne;
  }

  if ('model' in response) return response;

  return generateInvalidProviderResponseError(response, AZURE_AI_INFERENCE);
};
