import { FRIENDLI } from '../../globals';
import { Message, Params } from '../../types/requestBody';
import {
  ChatChoice,
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { OpenAIErrorResponseTransform } from '../openai/utils';

export const FriendliChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    default: '',
    transform: (params: Params) => {
      return params.messages?.map((message) => {
        if (message.role === 'developer') return { ...message, role: 'system' };
        return message;
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: null,
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: null,
    min: 0,
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
  n: {
    param: 'n',
    default: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stream_options: {
    param: 'stream_options',
  },
  stop: {
    param: 'stop',
  },
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
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
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  response_format: {
    param: 'response_format',
  },
  logprobs: {
    param: 'logprobs',
    default: false,
  },
  top_logprobs: {
    param: 'top_logprobs',
    min: 0,
    max: 20,
  },
  chat_template_kwargs: {
    param: 'chat_template_kwargs',
  },
  parse_reasoning: {
    param: 'parse_reasoning',
  },
  include_reasoning: {
    param: 'include_reasoning',
    default: true,
  },
  reasoning_effort: {
    param: 'reasoning_effort',
    default: null,
  },
  reasoning_budget: {
    param: 'reasoning_budget',
    default: null,
  },
};

interface FriendliChatCompleteResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: (ChatChoice & {
    message: Message & {
      reasoning_content?: string;
    };
  })[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

interface FriendliStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: any[];
    };
    index: number;
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const FriendliChatCompleteResponseTransform: (
  response: FriendliChatCompleteResponse | ErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, FRIENDLI);
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: FRIENDLI,
      choices: response.choices.map((c) => {
        const content_blocks = [];
        if (!strictOpenAiCompliance) {
          if (c.message.reasoning_content) {
            content_blocks.push({
              type: 'thinking',
              thinking: c.message.reasoning_content,
            });
          }
          content_blocks.push({
            type: 'text',
            text: c.message.content,
          });
        }
        return {
          index: c.index,
          message: {
            role: c.message.role,
            content: c.message.content,
            ...(content_blocks.length && { content_blocks }),
            ...(c.message.tool_calls && { tool_calls: c.message.tool_calls }),
          },
          finish_reason: c.finish_reason,
        };
      }),
      usage: response.usage,
    };
  }

  return generateInvalidProviderResponseError(response, FRIENDLI);
};

export const FriendliChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: Record<string, boolean>,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string | string[] = (
  responseChunk,
  fallbackId,
  _streamState,
  strictOpenAiCompliance,
  _gatewayRequest
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  let parsedChunk: FriendliStreamChunk;
  try {
    parsedChunk = JSON.parse(chunk);
  } catch {
    return `data: ${chunk}\n\n`;
  }

  const content_blocks = [];
  if (!strictOpenAiCompliance) {
    if (parsedChunk.choices?.[0]?.delta?.reasoning_content) {
      content_blocks.push({
        index: parsedChunk.choices[0].index,
        delta: {
          thinking: parsedChunk.choices[0].delta.reasoning_content,
        },
      });
    }
    if (parsedChunk.choices?.[0]?.delta?.content) {
      content_blocks.push({
        index: parsedChunk.choices[0].index,
        delta: {
          text: parsedChunk.choices[0].delta.content,
        },
      });
    }
  }

  const delta = { ...parsedChunk.choices?.[0]?.delta };
  if (strictOpenAiCompliance) {
    delete delta.reasoning_content;
  }

  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id || fallbackId,
      object: parsedChunk.object || 'chat.completion.chunk',
      created: parsedChunk.created || Math.floor(Date.now() / 1000),
      model: parsedChunk.model || '',
      provider: FRIENDLI,
      choices: [
        {
          index: parsedChunk.choices?.[0]?.index ?? 0,
          delta: {
            ...delta,
            ...(content_blocks.length && { content_blocks }),
          },
          finish_reason: parsedChunk.choices?.[0]?.finish_reason ?? null,
        },
      ],
      ...(parsedChunk.usage && { usage: parsedChunk.usage }),
    })}` + '\n\n'
  );
};
