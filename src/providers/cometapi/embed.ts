import { COMETAPI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { OpenAIEmbedConfig } from '../openai/embed';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { generateInvalidProviderResponseError } from '../utils';

export const CometAPIEmbedConfig: ProviderConfig = OpenAIEmbedConfig;

export const CometAPIEmbedResponseTransform: (
  response: EmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return OpenAIErrorResponseTransform(response, COMETAPI);
  }

  if ('data' in response) {
    return {
      ...response,
      provider: COMETAPI,
    };
  }

  return generateInvalidProviderResponseError(
    response as Record<string, any>,
    COMETAPI
  );
};
