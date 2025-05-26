import { HYPERBOLIC } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';

interface HyperbolicChatCompleteResponse extends ChatCompletionResponse {}

export const HyperbolicChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: 'n',
    default: 1,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 256,
    min: 0,
  },
  stop: {
    param: 'stop',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stream_options: {
    param: 'stream_options',
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  logit_bias: {
    param: 'logit_bias',
  },
  user: {
    param: 'user',
  },
  seed: {
    param: 'seed',
  },
  logprobs: {
    param: 'logprobs',
    default: false,
  },
  top_logprobs: {
    param: 'top_logprobs',
    default: 0,
    min: 0,
    max: 20,
  },
  repetition_penalty: {
    param: 'repetition_penalty',
    default: 1,
  },
  top_k: {
    param: 'top_k',
    default: -1,
  },
  min_p: {
    param: 'min_p',
    default: 0,
    min: 0,
    max: 1,
  },
};

interface HyperbolicStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role?: string | null;
      content?: string;
    };
    finish_reason: string | null;
  }[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
    completion_tokens: number;
  };
}

export const HyperbolicChatCompleteResponseTransform: (
  response: HyperbolicChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, HYPERBOLIC);
  }

  Object.defineProperty(response, 'provider', {
    value: HYPERBOLIC,
    enumerable: true,
  });

  return response;
};

export const HyperbolicChatCompleteStreamChunkTransform = (
  responseChunk: string
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: HyperbolicStreamChunk = JSON.parse(chunk);
    return (
      `data: ${JSON.stringify({
        id: parsedChunk.id,
        object: parsedChunk.object,
        created: parsedChunk.created,
        model: parsedChunk.model,
        provider: HYPERBOLIC,
        choices: [
          {
            index: parsedChunk.choices[0].index,
            message: parsedChunk.choices[0].message,
            finish_reason: parsedChunk.choices[0].finish_reason,
          },
        ],
        usage: {
          prompt_tokens: parsedChunk.usage.prompt_tokens,
          total_tokens: parsedChunk.usage.total_tokens,
          completion_tokens: parsedChunk.usage.completion_tokens,
        },
      })}` + '\n\n'
    );
  } catch (error) {
    console.error('Error parsing Hyperbolic stream chunk:', error);
    return `data: ${chunk}\n\n`;
  }
};
