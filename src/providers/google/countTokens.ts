import { GOOGLE } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  GoogleChatCompleteConfig,
  GoogleErrorResponse,
  GoogleErrorResponseTransform,
} from './chatComplete';

// GoogleCountTokensConfig reuses the same transforms as GoogleChatCompleteConfig
// for contents, systemInstruction, tools, and tool_choice so that all token-contributing
// parameters are forwarded to the Gemini countTokens endpoint.
// The model param is required but does not need a default for counting.
export const GoogleCountTokensConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: GoogleChatCompleteConfig.messages,
  tools: GoogleChatCompleteConfig.tools,
  tool_choice: GoogleChatCompleteConfig.tool_choice,
};

interface GoogleCountTokensResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}

// GoogleCountTokensResponseTransform maps Gemini's { totalTokens } to the
// gateway's unified { input_tokens } format.
export const GoogleCountTokensResponseTransform: (
  response: GoogleCountTokensResponse | GoogleErrorResponse,
  responseStatus: number
) => { input_tokens: number } | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = GoogleErrorResponseTransform(
      response as GoogleErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('totalTokens' in response) {
    return {
      input_tokens: response.totalTokens,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE);
};
