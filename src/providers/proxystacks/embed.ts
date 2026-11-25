import { PROXYSTACKS } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { OpenAIEmbedConfig } from '../openai/embed';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ErrorResponse, ProviderConfig } from '../types';

export const ProxyStacksEmbedConfig: ProviderConfig = OpenAIEmbedConfig;

export const ProxyStacksEmbedResponseTransform: (
  response: EmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, PROXYSTACKS);
  }

  Object.defineProperty(response, 'provider', {
    value: PROXYSTACKS,
    enumerable: true,
  });

  return response;
};
