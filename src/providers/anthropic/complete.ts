import { ANTHROPIC } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  CompletionResponse,
  ErrorResponse,
  OPEN_AI_COMPLETION_FINISH_REASON,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  AnthropicErrorResponse,
  AnthropicErrorResponseTransform,
} from './chatComplete';
import { ANTHROPIC_STOP_REASON } from './types';

// TODO: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AnthropicCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    default: 'claude-instant-1',
    required: true,
  },
  prompt: {
    param: 'prompt',
    transform: (params: Params) => `\n\nHuman: ${params.prompt}\n\nAssistant:`,
    required: true,
  },
  max_tokens: {
    param: 'max_tokens_to_sample',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: -1,
    min: -1,
  },
  top_k: {
    param: 'top_k',
    default: -1,
  },
  stop: {
    param: 'stop_sequences',
    transform: (params: Params) => {
      if (params.stop === null) {
        return [];
      }
      return params.stop;
    },
  },
  stream: {
    param: 'stream',
    default: false,
  },
  user: {
    param: 'metadata.user_id',
  },
};

interface AnthropicCompleteResponse {
  completion: string;
  stop_reason: ANTHROPIC_STOP_REASON | string;
  model: string;
  truncated: boolean;
  stop: null | string;
  log_id: string;
  exception: null | string;
}

export const transformAnthropicCompletionFinishReason = (
  stopReason: ANTHROPIC_STOP_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (stopReason) {
    case ANTHROPIC_STOP_REASON.stop_sequence:
    case ANTHROPIC_STOP_REASON.end_turn:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case ANTHROPIC_STOP_REASON.tool_use:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};

export const transformAnthropicCompletionStreamChunkFinishReason = (
  stopReason?: ANTHROPIC_STOP_REASON | string | null
): OPEN_AI_COMPLETION_FINISH_REASON | null => {
  if (!stopReason) return null;
  return transformAnthropicCompletionFinishReason(stopReason);
};

// TODO: The token calculation is wrong atm
export const AnthropicCompleteResponseTransform: (
  response: AnthropicCompleteResponse | AnthropicErrorResponse,
  responseStatus: number
) => CompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = AnthropicErrorResponseTransform(
      response as AnthropicErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('completion' in response) {
    return {
      id: response.log_id,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      provider: ANTHROPIC,
      choices: [
        {
          text: response.completion,
          index: 0,
          logprobs: null,
          finish_reason: transformAnthropicCompletionFinishReason(
            response.stop_reason
          ),
        },
      ],
    };
  }

  return generateInvalidProviderResponseError(response, ANTHROPIC);
};

export const AnthropicCompleteStreamChunkTransform: (
  response: string
) => string | undefined = (responseChunk) => {
  let chunk = responseChunk.trim();
  if (chunk.startsWith('event: ping')) {
    return;
  }

  chunk = chunk.replace(/^event: completion[\r\n]*/, '');
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return chunk;
  }
  const parsedChunk: AnthropicCompleteResponse = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.log_id,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: parsedChunk.model,
      provider: 'anthropic',
      choices: [
        {
          text: parsedChunk.completion,
          index: 0,
          logprobs: null,
          finish_reason: transformAnthropicCompletionStreamChunkFinishReason(
            parsedChunk.stop_reason
          ),
        },
      ],
    })}` + '\n\n'
  );
};
