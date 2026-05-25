import { TRITON } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';

function messagesToPrompt(messages: { role: string; content: string }[]): string {
  if (!messages || messages.length === 0) return '';
  return messages
    .map((m) => {
      switch (m.role) {
        case 'system':
          return `System: ${m.content}`;
        case 'user':
          return `User: ${m.content}`;
        case 'assistant':
          return `Assistant: ${m.content}`;
        default:
          return `${m.role}: ${m.content}`;
      }
    })
    .join('\n');
}

export const TritonChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'text_input',
    required: true,
    transform: (params: Params) => {
      return messagesToPrompt(params.messages as any);
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    required: true,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 100,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: 0.7,
  },
  top_k: {
    param: 'top_k',
    default: 50,
  },
  stop: {
    param: 'stop_words',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  bad_words: {
    param: 'bad_words',
  },
};

interface TritonChatCompleteResponse {
  cum_log_probs: number;
  model_name: string;
  model_version: number;
  output_log_probs: number[];
  sequence_end: boolean;
  sequence_id: number;
  sequence_start: boolean;
  text_output: string;
}

export const TritonChatCompleteResponseTransform: (
  response: TritonChatCompleteResponse | any,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return {
      error: {
        message: response?.error || 'Unknown error',
        type: null,
        param: null,
        code: null,
      },
      provider: TRITON,
    };
  }

  // Handle Triton generate endpoint response
  if (response?.text_output) {
    return {
      id: crypto.randomUUID(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model_name || '',
      provider: TRITON,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.text_output,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1,
      },
    };
  }

  // If response is already OpenAI-compatible (e.g. via Triton Python backend wrapper)
  if (response?.choices) {
    return {
      ...response,
      id: 'portkey-' + crypto.randomUUID(),
      provider: TRITON,
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};
