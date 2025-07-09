import { COHERE } from '../../globals';
import { Message, Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateErrorResponse } from '../utils';
import { CohereStreamState } from './types';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const CohereChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    default: 'command-r-plus',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      const messages = params.messages || [];
      if (messages.length === 0) {
        throw new Error('messages length should be at least of length 1');
      }

      return messages.map((message: Message) => {
        let content: string = '';

        if (typeof message.content === 'string') {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          const textContents = message.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text);

          if (textContents.length === 0) {
            throw new Error('No text content found in message content array');
          }

          content = textContents.join('\n');
        }

        return {
          role:
            message.role === 'assistant'
              ? 'assistant'
              : message.role === 'user'
                ? 'user'
                : message.role === 'system'
                  ? 'system'
                  : message.role,
          content: content,
        };
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: 20,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.75,
    min: 0,
    max: 5,
  },
  top_p: {
    param: 'p',
    default: 0.75,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'k',
    default: 0,
    max: 500,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  stop: {
    param: 'stop_sequences',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  seed: {
    param: 'seed',
  },
  logprobs: {
    param: 'logprobs',
    default: false,
  },
  preamble: {
    param: 'preamble',
  },
  connectors: {
    param: 'connectors',
  },
  search_queries_only: {
    param: 'search_queries_only',
    default: false,
  },
  citation_quality: {
    param: 'citation_quality',
    default: 'accurate',
  },
  prompt_truncation: {
    param: 'prompt_truncation',
    default: 'AUTO',
  },
  tools: {
    param: 'tools',
  },
  tool_results: {
    param: 'tool_results',
  },
};

interface CohereV2CompleteResponse {
  id: string;
  finish_reason:
    | 'COMPLETE'
    | 'STOP_SEQUENCE'
    | 'MAX_TOKENS'
    | 'TOOL_CALL'
    | 'ERROR';
  message: {
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_calls';
      text?: string;
      tool_calls?: Array<{
        name: string;
        parameters: Record<string, any>;
      }>;
    }>;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  logprobs?: Array<{
    token: string;
    logprob: number;
  }> | null;
  search_results?: Array<{
    search_query: string;
    results: Array<{
      id: string;
      title: string;
      url: string;
      text: string;
    }>;
  }>;
  citations?: Array<{
    start: number;
    end: number;
    text: string;
    document_ids: string[];
  }>;
}

interface CohereV2ErrorResponse {
  message?: string;
  error?: string;
  status?: number;
}

export const CohereChatCompleteResponseTransform: (
  response: CohereV2CompleteResponse | CohereV2ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = response as CohereV2ErrorResponse;
    return generateErrorResponse(
      {
        message:
          errorResponse.message || errorResponse.error || 'Unknown error',
        type: null,
        param: null,
        code: null,
      },
      COHERE
    );
  }

  const successResponse = response as CohereV2CompleteResponse;

  const textContent = successResponse.message.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');

  const toolCalls = successResponse.message.content
    .filter((c) => c.type === 'tool_calls')
    .flatMap((c) => c.tool_calls || []);

  const message: any = { role: 'assistant', content: textContent };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((toolCall, index) => ({
      id: `call_${index}`,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.parameters),
      },
    }));
  }

  return {
    id: successResponse.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'Unknown',
    provider: COHERE,
    choices: [
      {
        message,
        index: 0,
        finish_reason: successResponse.finish_reason,
      },
    ],
    usage: {
      completion_tokens: successResponse.usage.output_tokens,
      prompt_tokens: successResponse.usage.input_tokens,
      total_tokens: Number(
        successResponse.usage.output_tokens + successResponse.usage.input_tokens
      ),
    },
  };
};

export type CohereV2StreamChunk =
  | {
      type: 'message-start';
      message: {
        id: string;
        role: 'assistant';
        content: Array<any>;
      };
    }
  | {
      type: 'content-start';
      index: number;
      content_block: {
        type: 'text' | 'tool_calls';
        text?: string;
        tool_calls?: Array<{
          name: string;
          parameters: Record<string, any>;
        }>;
      };
    }
  | {
      type: 'content-delta';
      index: number;
      delta: {
        text?: string;
        tool_calls?: Array<{
          name: string;
          parameters: Record<string, any>;
        }>;
      };
    }
  | {
      type: 'content-end';
      index: number;
    }
  | {
      type: 'message-end';
      message: {
        id: string;
        finish_reason: CohereV2CompleteResponse['finish_reason'];
        usage: CohereV2CompleteResponse['usage'];
        search_results?: CohereV2CompleteResponse['search_results'];
        citations?: CohereV2CompleteResponse['citations'];
      };
    };

export const CohereChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: CohereStreamState,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string = (
  responseChunk,
  fallbackId,
  streamState = { generation_id: '' },
  _strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (!chunk || chunk === '[DONE]') {
    return `data: [DONE]\n\n`;
  }

  try {
    const parsedChunk: CohereV2StreamChunk = JSON.parse(chunk);

    if (parsedChunk.type === 'message-start') {
      streamState.generation_id = parsedChunk.message.id;
    }

    const messageId = streamState?.generation_id ?? fallbackId;
    let deltaContent = '';
    let finishReason = null;
    let usage = null;

    if (parsedChunk.type === 'content-delta') {
      deltaContent = parsedChunk.delta.text || '';
    } else if (parsedChunk.type === 'message-end') {
      finishReason = parsedChunk.message.finish_reason;
      usage = {
        completion_tokens: parsedChunk.message.usage.output_tokens,
        prompt_tokens: parsedChunk.message.usage.input_tokens,
        total_tokens: Number(
          parsedChunk.message.usage.output_tokens +
            parsedChunk.message.usage.input_tokens
        ),
      };
    }

    return (
      `data: ${JSON.stringify({
        id: messageId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: gatewayRequest.model || '',
        provider: COHERE,
        ...(usage && { usage }),
        choices: [
          {
            index: 0,
            delta: {
              content: deltaContent,
              role: 'assistant',
            },
            logprobs: null,
            finish_reason: finishReason,
          },
        ],
      })}` + '\n\n'
    );
  } catch (error) {
    return `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: COHERE,
      error: error instanceof Error ? error.message : String(error),
      choices: [
        {
          index: 0,
          delta: {
            content: '',
            role: 'assistant',
          },
          logprobs: null,
          finish_reason: null,
        },
      ],
    })}\n\n`;
  }
};
