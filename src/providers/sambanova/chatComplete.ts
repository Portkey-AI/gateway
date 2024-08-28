import { SAMBANOVA } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const SamvaNovaChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'Meta-Llama-3.1-8B-Instruct',
  },
  messages: {
    param: 'messages',
    default: '',
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  stream: {
    param: 'stream',
    default: true,
  },
  stream_options: {
    param: 'stream_options',
  },
  // todo: `temperature`, `top_p`, and etc does not exist on document but api-starter-kit have.
  // todo: Current API supports only stream.
  stop: {
    param: 'stop',
  },
};

export interface SamvaNovaChatCompleteResponse extends ChatCompletionResponse {}

export interface SamvaNovaErrorResponse extends ErrorResponse {}

export interface SamvaNovaStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint: string;
  choices: {
    delta: {
      content?: string;
    };
    index: number;
    finish_reason: string | null;
    logprobs: object | null;
  }[];
  usage: {
    is_last_response: boolean;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    time_to_first_token: number;
    end_time: number;
    start_time: number;
    total_latency: number;
    total_tokens_per_sec: number;
    completion_tokens_per_sec: number;
    completion_tokens_after_first_per_sec: number;
    completion_tokens_after_first_per_sec_first_ten: number;
  } | null;
}

export const SamvaNovaChatCompleteResponseTransform: (
  response: SamvaNovaChatCompleteResponse | SamvaNovaErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type,
        param: null,
        code: response.error.code?.toString() || null,
      },
      SAMBANOVA
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: SAMBANOVA,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: c.message,
        logprobs: c.logprobs,
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, SAMBANOVA);
};

export const SamvaNovaChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: SamvaNovaStreamChunk = JSON.parse(chunk);
  if (parsedChunk.usage) {
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: SAMBANOVA,
      choices: [],
      usage: {
        prompt_tokens: parsedChunk.usage.prompt_tokens || 0,
        completion_tokens: parsedChunk.usage.completion_tokens || 0,
        total_tokens: parsedChunk.usage.total_tokens || 0,
      },
    })}\n\n`;
  }
  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider: SAMBANOVA,
    choices: [
      {
        index: parsedChunk.choices[0].index || 0,
        delta: {
          role: 'assistant',
          content: parsedChunk.choices[0].delta.content,
        },
        logprobs: null,
        finish_reason: parsedChunk.choices[0].finish_reason || null,
      },
    ],
  })}\n\n`;
};
