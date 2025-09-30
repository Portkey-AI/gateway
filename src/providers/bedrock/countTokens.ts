import { ProviderConfig } from '../types';
import { BedrockMessagesParams } from './types';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { BedrockConverseMessagesConfig } from './messages';
import { Params } from '../../types/requestBody';
import { BEDROCK } from '../../globals';
import { BedrockErrorResponseTransform } from './chatComplete';
import { generateInvalidProviderResponseError } from '../utils';

// https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_CountTokens.html#API_runtime_CountTokens_RequestSyntax
export const BedrockConverseMessageCountTokensConfig: ProviderConfig = {
  messages: {
    param: 'input',
    required: true,
    transform: (params: BedrockMessagesParams) => {
      return {
        converse: transformUsingProviderConfig(
          BedrockConverseMessagesConfig,
          params as Params
        ),
      };
    },
  },
};

// https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_CountTokens.html#API_runtime_CountTokens_ResponseSyntax
export const BedrockConverseMessageCountTokensResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return (
      BedrockErrorResponseTransform(response) ||
      generateInvalidProviderResponseError(response, BEDROCK)
    );
  }

  if ('inputTokens' in response) {
    return {
      input_tokens: response.inputTokens,
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
