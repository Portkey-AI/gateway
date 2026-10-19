import { WEBWRIGHT } from '../../globals';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';

export const WebWrightChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'wren-r1',
  },
  messages: {
    param: 'messages',
    default: '',
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 1,
    max: 200000,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stop: {
    param: 'stop',
    default: null,
  },
};

interface WebWrightChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface WebWrightStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string;
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const WebWrightChatCompleteResponseTransform: (
  response: WebWrightChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return OpenAIErrorResponseTransform(response, WEBWRIGHT);
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: WEBWRIGHT,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, WEBWRIGHT);
};

export const WebWrightChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: WebWrightStreamChunk = JSON.parse(chunk);

    return (
      `data: ${JSON.stringify({
        id: parsedChunk.id,
        object: parsedChunk.object,
        created: parsedChunk.created,
        model: parsedChunk.model,
        provider: WEBWRIGHT,
        choices: [
          {
            index: parsedChunk.choices[0]?.index ?? 0,
            delta: parsedChunk.choices[0]?.delta ?? {},
            finish_reason: parsedChunk.choices[0]?.finish_reason ?? null,
          },
        ],
      })}` + '\n\n'
    );
  } catch (error) {
    console.error('Error parsing WebWright stream chunk:', error);
    return `data: ${chunk}\n\n`;
  }
};
