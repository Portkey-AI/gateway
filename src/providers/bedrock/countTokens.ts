import { ProviderConfig } from '../types';
import { BedrockMessagesParams } from './types';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { BedrockConverseMessagesConfig } from './messages';
import { Params } from '../../types/requestBody';
import { BEDROCK } from '../../globals';
import { BedrockErrorResponseTransform } from './chatComplete';
import { generateInvalidProviderResponseError } from '../utils';
import { AnthropicMessagesConfig } from '../anthropic/messages';

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

export const BedrockAnthropicMessageCountTokensConfig: ProviderConfig = {
  messages: {
    param: 'input',
    required: true,
    transform: (params: BedrockMessagesParams) => {
      const anthropicParams = transformUsingProviderConfig(
        AnthropicMessagesConfig,
        params as Params
      );
      delete anthropicParams.model;
      anthropicParams.anthropic_version =
        params.anthropic_version || 'bedrock-2023-05-31';
      anthropicParams.max_tokens = anthropicParams.max_tokens || 10;
      return {
        invokeModel: {
          body: Buffer.from(
            JSON.stringify({
              ...anthropicParams,
            })
          ).toString('base64'),
        },
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
