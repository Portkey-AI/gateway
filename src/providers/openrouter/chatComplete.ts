import { OPENROUTER } from '../../globals';
import { Message, Params } from '../../types/requestBody';
import {
  ChatChoice,
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { transformReasoningParams, transformUsageOptions } from './utils';

export const OpenrouterChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'openrouter/auto',
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
    default: 100,
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  modalities: {
    param: 'modalities',
  },
  reasoning: {
    param: 'reasoning',
    transform: (params: Params) => {
      return transformReasoningParams(params);
    },
  },
  reasoning_effort: {
    param: 'reasoning',
    transform: (params: Params) => {
      return transformReasoningParams(params);
    },
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  transforms: {
    param: 'transforms',
  },
  provider: {
    param: 'provider',
  },
  models: {
    param: 'models',
  },
  usage: {
    param: 'usage',
    transform: (params: Params) => {
      return transformUsageOptions(params);
    },
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stream_options: {
    param: 'usage',
    transform: (params: Params) => {
      return transformUsageOptions(params);
    },
  },
  response_format: {
    param: 'response_format',
  },
};

interface OpenrouterUsageDetails {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens: number;
    audio_tokens: number;
  };
  completion_tokens_details?: {
    reasoning_tokens: number;
    audio_tokens: number;
    accepted_prediction_tokens: number;
    rejected_prediction_tokens: number;
  };
  cost?: number;
}

interface OpenrouterChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: (ChatChoice & { message: Message & { reasoning: string } })[];
  usage: OpenrouterUsageDetails;
}

export interface OpenrouterErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

interface OpenrouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  usage?: OpenrouterUsageDetails;
  choices: {
    delta: {
      role?: string | null;
      content?: string;
      reasoning?: string;
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const OpenrouterChatCompleteResponseTransform: (
  response: OpenrouterChatCompleteResponse | OpenrouterErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  _gatewayRequestUrl: string,
  _gatewayRequest: Params
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance,
  _gatewayRequestUrl,
  _gatewayRequest
) => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      OPENROUTER
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: OPENROUTER,
      choices: response.choices.map((c) => {
        const content_blocks = [];

        if (!strictOpenAiCompliance) {
          if (c.message.reasoning) {
            content_blocks.push({
              type: 'thinking',
              thinking: c.message.reasoning,
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

  return generateInvalidProviderResponseError(response, OPENROUTER);
};

export const OpenrouterChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  _streamState: Record<string, boolean>,
  _strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string = (
  responseChunk,
  fallbackId,
  _streamState,
  strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  if (chunk.includes('OPENROUTER PROCESSING')) {
    chunk = JSON.stringify({
      id: `${Date.now()}`,
      model: gatewayRequest.model || '',
      object: 'chat.completion.chunk',
      created: Date.now(),
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
        },
      ],
    });
  }
  const parsedChunk: OpenrouterStreamChunk = JSON.parse(chunk);

  const content_blocks = [];
  if (!strictOpenAiCompliance) {
    // add the reasoning first
    if (parsedChunk.choices?.[0]?.delta?.reasoning) {
      content_blocks.push({
        index: parsedChunk.choices?.[0]?.index,
        delta: {
          thinking: parsedChunk.choices?.[0]?.delta?.reasoning,
        },
      });
    }
    // then add the content
    if (parsedChunk.choices?.[0]?.delta?.content) {
      content_blocks.push({
        index: parsedChunk.choices?.[0]?.index,
        delta: {
          text: parsedChunk.choices?.[0]?.delta?.content,
        },
      });
    }
  }

  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: OPENROUTER,
      choices: [
        {
          index: parsedChunk.choices?.[0]?.index,
          delta: {
            ...parsedChunk.choices?.[0]?.delta,
            ...(content_blocks.length && { content_blocks }),
          },
          finish_reason: parsedChunk.choices?.[0]?.finish_reason,
        },
      ],
      ...(parsedChunk.usage && { usage: parsedChunk.usage }),
    })}` + '\n\n'
  );
};
