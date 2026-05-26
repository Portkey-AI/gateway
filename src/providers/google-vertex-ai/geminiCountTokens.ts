import { GOOGLE_VERTEX_AI } from '../../globals';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { VertexGoogleChatCompleteConfig } from './chatComplete';
import { GoogleErrorResponse } from './types';

// VertexGeminiCountTokensConfig reuses the same transforms as
// VertexGoogleChatCompleteConfig for contents, systemInstruction, tools, and
// tool_choice so that all token-contributing parameters are forwarded to the
// Vertex AI Gemini countTokens endpoint.
export const VertexGeminiCountTokensConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: VertexGoogleChatCompleteConfig.messages,
  tools: VertexGoogleChatCompleteConfig.tools,
  tool_choice: VertexGoogleChatCompleteConfig.tool_choice,
};

interface VertexGeminiCountTokensResponse {
  totalTokens: number;
  cachedContentTokenCount?: number;
}

// VertexGeminiCountTokensResponseTransform maps Vertex AI Gemini's
// { totalTokens } to the gateway's unified { input_tokens } format.
export const VertexGeminiCountTokensResponseTransform: (
  response: VertexGeminiCountTokensResponse | GoogleErrorResponse,
  responseStatus: number
) => { input_tokens: number } | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    const errorResponse = response as GoogleErrorResponse;
    return generateErrorResponse(
      {
        message: errorResponse.error?.message ?? '',
        type: errorResponse.error?.status ?? null,
        param: null,
        code: String(errorResponse.error?.code ?? ''),
      },
      GOOGLE_VERTEX_AI
    );
  }

  if ('totalTokens' in response) {
    return {
      input_tokens: response.totalTokens,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};
