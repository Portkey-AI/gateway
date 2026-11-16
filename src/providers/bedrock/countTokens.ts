import { ProviderConfig } from '../types';
import { BedrockMessagesParams } from './types';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { BedrockConverseMessagesConfig } from './messages';
import { Options, Params } from '../../types/requestBody';
import { BEDROCK } from '../../globals';
import { BedrockErrorResponseTransform } from './chatComplete';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { AnthropicMessagesConfig } from '../anthropic/messages';
import { getBedrockModelWithoutRegion } from './utils';

// https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_CountTokens.html#API_runtime_CountTokens_RequestSyntax
export const BedrockConverseMessageCountTokensConfig: ProviderConfig = {
  messages: {
    param: 'input',
    required: true,
    transform: (params: BedrockMessagesParams, providerOptions: Options) => {
      return {
        converse: transformUsingProviderConfig(
          BedrockConverseMessagesConfig,
          params as Params,
          providerOptions
        ),
      };
    },
  },
};

export const BedrockAnthropicMessageCountTokensConfig: ProviderConfig = {
  messages: {
    param: 'input',
    required: true,
    transform: (params: BedrockMessagesParams, providerOptions: Options) => {
      const anthropicParams = transformUsingProviderConfig(
        AnthropicMessagesConfig,
        params as Params,
        providerOptions
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

// Anthropic count_tokens request for the bedrock-mantle endpoint. This is an
// explicit allowlist rather than getMessagesConfig() (as Vertex AI uses): that
// config requires max_tokens and carries sampling fields, which count_tokens
// rejects as extra inputs.
// https://docs.aws.amazon.com/bedrock/latest/userguide/count-tokens.html#count-tokens-mantle
export const BedrockMantleMessagesCountTokensConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    transform: (params: Params, providerOptions: Options) =>
      getBedrockModelWithoutRegion(
        providerOptions.foundationModel ||
          decodeURIComponent(params.model ?? '')
      ),
  },
  messages: { param: 'messages', required: true },
  system: { param: 'system' },
  tools: { param: 'tools' },
  tool_choice: { param: 'tool_choice' },
  thinking: { param: 'thinking' },
  mcp_servers: { param: 'mcp_servers' },
  context_management: { param: 'context_management' },
  output_config: { param: 'output_config' },
  output_format: { param: 'output_format' },
  cache_control: { param: 'cache_control' },
  speed: { param: 'speed' },
};

// https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_CountTokens.html#API_runtime_CountTokens_ResponseSyntax
export const BedrockConverseMessageCountTokensResponseTransform = (
  response: any,
  responseStatus: number
) => {
  // bedrock-mantle returns errors in Anthropic's shape.
  if (response?.type === 'error' && response?.error?.message) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type ?? null,
        param: null,
        code: null,
      },
      BEDROCK
    );
  }

  if (responseStatus !== 200 && 'error' in response) {
    return (
      BedrockErrorResponseTransform(response) ||
      generateInvalidProviderResponseError(response, BEDROCK)
    );
  }

  // AWS errors, e.g. a missing bedrock-mantle:CountTokens permission.
  const awsErrorMessage = response?.message ?? response?.Message;
  if (responseStatus !== 200 && typeof awsErrorMessage === 'string') {
    return generateErrorResponse(
      { message: awsErrorMessage, type: null, param: null, code: null },
      BEDROCK
    );
  }

  if ('inputTokens' in response) {
    return {
      input_tokens: response.inputTokens,
    };
  }

  // bedrock-mantle returns Anthropic's count_tokens shape.
  if (responseStatus === 200 && typeof response?.input_tokens === 'number') {
    return {
      input_tokens: response.input_tokens,
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
