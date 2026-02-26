/**
 * Google Gemini Model Handler
 *
 * Handles Google's Gemini family models on OCI GenAI.
 * Gemini models use reasoning tokens internally, requiring higher max_tokens.
 * They may also omit role in some response formats.
 */

import { BaseModelHandler, ModelHandlerConfig } from './base';
import { OracleChatCompleteResponse } from '../types/GenericChatResponse';

export class GeminiHandler extends BaseModelHandler {
  constructor(modelId: string) {
    const config: ModelHandlerConfig = {
      modelId,
      family: 'google',
      minTokens: 100, // Higher due to reasoning token overhead
      usesReasoningTokens: true,
      supportsTools: true,
      supportsStreaming: true,
      supportsSystemMessages: true,
    };
    super(config);
  }

  /**
   * Gemini sometimes doesn't include role in responses
   */
  needsRoleDefault(): boolean {
    return true;
  }

  /**
   * Post-process response to ensure role is present
   */
  postProcessResponse(
    response: OracleChatCompleteResponse
  ): OracleChatCompleteResponse {
    // Ensure all choices have a role
    if (response.chatResponse?.choices) {
      response.chatResponse.choices = response.chatResponse.choices.map(
        (choice) => {
          if (choice.message && !choice.message.role) {
            return {
              ...choice,
              message: {
                ...choice.message,
                role: 'ASSISTANT',
              },
            };
          }
          return choice;
        }
      );
    }
    return response;
  }
}
