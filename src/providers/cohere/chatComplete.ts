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
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      const messages = params.messages || [];
      if (messages.length === 0) {
        throw new Error('At least one message is required');
      }

      return messages.map((message: Message) => {
        if (message.role === 'system') {
          return {
            role: 'system',
            content: typeof message.content === 'string' ? message.content : '',
          };
        }

        if (message.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: message.tool_call_id,
            content: message.content,
          };
        }

        let content: string | Array<any> = '';

        if (typeof message.content === 'string') {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          const cohereContent: Array<any> = [];

          for (const item of message.content) {
            if (item.type === 'text') {
              cohereContent.push({
                type: 'text',
                text: item.text,
              });
            } else if (item.type === 'image_url') {
              cohereContent.push({
                type: 'image',
                source: {
                  type: 'url',
                  url: item.image_url?.url,
                },
              });
            }
          }

          content = cohereContent.length > 0 ? cohereContent : '';
        }

        const cohereMessage: any = {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: content,
        };

        if (message.role === 'assistant' && message.tool_calls) {
          cohereMessage.tool_calls = message.tool_calls.map(
            (toolCall: any) => ({
              id: toolCall.id,
              type: toolCall.type,
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            })
          );
        }

        if (message.role === 'assistant' && (message as any).tool_plan) {
          cohereMessage.tool_plan = (message as any).tool_plan;
        }

        return cohereMessage;
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.3,
    min: 0,
  },
  seed: {
    param: 'seed',
  },
  stop: {
    param: 'stop_sequences',
  },
  top_k: {
    param: 'k',
    default: 0,
    min: 0,
    max: 500,
  },
  top_p: {
    param: 'p',
    default: 0.75,
    min: 0.01,
    max: 0.99,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0.0,
    min: 0.0,
    max: 1.0,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0.0,
    min: 0.0,
    max: 1.0,
  },
  logprobs: {
    param: 'logprobs',
    default: false,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  tools: {
    param: 'tools',
    transform: (params: Params) => {
      if (!params.tools) return undefined;

      return params.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));
    },
  },
  tool_choice: {
    param: 'tool_choice',
    transform: (params: Params) => {
      const toolChoice = params.tool_choice;
      if (!toolChoice) return undefined;

      if (toolChoice === 'none') return 'NONE';
      if (toolChoice === 'required') return 'REQUIRED';
      if (toolChoice === 'auto') return undefined;

      return toolChoice;
    },
  },
  strict_tools: {
    param: 'strict_tools',
  },
  documents: {
    param: 'documents',
  },
  citation_options: {
    param: 'citation_options',
  },
  response_format: {
    param: 'response_format',
  },
  safety_mode: {
    param: 'safety_mode',
    default: 'CONTEXTUAL',
  },
};

interface CohereV2Usage {
  billed_units: {
    input_tokens: number;
    output_tokens: number;
  };
  tokens: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface CohereV2Citation {
  start: number;
  end: number;
  text: string;
  sources: Array<{
    type: string;
    id: string;
    document?: any;
    tool_output?: any;
  }>;
}

interface CohereV2ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface CohereV2Message {
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  tool_calls?: CohereV2ToolCall[];
  tool_plan?: string;
  citations?: CohereV2Citation[];
}

interface CohereV2CompleteResponse {
  id: string;
  finish_reason:
    | 'COMPLETE'
    | 'STOP_SEQUENCE'
    | 'MAX_TOKENS'
    | 'TOOL_CALL'
    | 'ERROR';
  message: CohereV2Message;
  usage?: CohereV2Usage;
  logprobs?: Array<{
    token: string;
    logprob: number;
  }>;
}

interface CohereV2ErrorResponse {
  message?: string;
  error?: string;
  detail?: string;
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
          errorResponse.message ||
          errorResponse.error ||
          errorResponse.detail ||
          'Unknown error',
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

  const message: any = {
    role: 'assistant',
    content: textContent,
  };

  if (
    successResponse.message.tool_calls &&
    successResponse.message.tool_calls.length > 0
  ) {
    message.tool_calls = successResponse.message.tool_calls.map((toolCall) => ({
      id: toolCall.id,
      type: toolCall.type,
      function: {
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      },
    }));
  }

  let finishReason: string = successResponse.finish_reason;
  if (finishReason === 'COMPLETE') finishReason = 'stop';
  else if (finishReason === 'MAX_TOKENS') finishReason = 'length';
  else if (finishReason === 'TOOL_CALL') finishReason = 'tool_calls';
  else if (finishReason === 'STOP_SEQUENCE') finishReason = 'stop';

  return {
    id: successResponse.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'command-r-plus', // Default model name
    provider: COHERE,
    choices: [
      {
        message,
        index: 0,
        finish_reason: finishReason,
      },
    ],
    usage: successResponse.usage
      ? {
          completion_tokens:
            successResponse.usage.billed_units?.output_tokens || 0,
          prompt_tokens: successResponse.usage.billed_units?.input_tokens || 0,
          total_tokens:
            (successResponse.usage.billed_units?.output_tokens || 0) +
            (successResponse.usage.billed_units?.input_tokens || 0),
        }
      : undefined,
  };
};

export type CohereV2StreamChunk =
  | {
      type: 'message-start';
      message: {
        id: string;
        role: 'assistant';
        content: Array<any>;
        tool_calls?: Array<any>;
        tool_plan?: string;
      };
    }
  | {
      type: 'content-start';
      index: number;
      content_block: {
        type: 'text';
        text: string;
      };
    }
  | {
      type: 'content-delta';
      index: number;
      delta: {
        text?: string;
      };
    }
  | {
      type: 'content-end';
      index: number;
    }
  | {
      type: 'tool-plan-delta';
      delta: {
        tool_plan?: string;
      };
    }
  | {
      type: 'tool-call-start';
      index: number;
      tool_call: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      };
    }
  | {
      type: 'tool-call-delta';
      index: number;
      delta: {
        function?: {
          arguments?: string;
        };
      };
    }
  | {
      type: 'tool-call-end';
      index: number;
    }
  | {
      type: 'citation-start';
      index: number;
      citation: CohereV2Citation;
    }
  | {
      type: 'citation-end';
      index: number;
    }
  | {
      type: 'message-end';
      message: {
        id: string;
        finish_reason: CohereV2CompleteResponse['finish_reason'];
        usage?: CohereV2Usage;
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
  streamState = { generation_id: '', tool_calls: {}, current_tool_call: null },
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
      streamState.tool_calls = {};
      streamState.current_tool_call = null;
    }

    const messageId = streamState?.generation_id ?? fallbackId;
    let deltaContent = '';
    let finishReason = null;
    let usage = null;
    let toolCalls = null;

    if (parsedChunk.type === 'content-delta') {
      deltaContent = parsedChunk.delta.text || '';
    } else if (parsedChunk.type === 'tool-call-start') {
      streamState.current_tool_call = {
        id: parsedChunk.tool_call.id,
        type: 'function',
        function: {
          name: parsedChunk.tool_call.function.name,
          arguments: '',
        },
      };
      streamState.tool_calls[parsedChunk.index] = streamState.current_tool_call;

      toolCalls = [streamState.current_tool_call];
    } else if (parsedChunk.type === 'tool-call-delta') {
      if (
        streamState.current_tool_call &&
        parsedChunk.delta.function?.arguments
      ) {
        streamState.current_tool_call.function.arguments +=
          parsedChunk.delta.function.arguments;
        toolCalls = [streamState.current_tool_call];
      }
    } else if (parsedChunk.type === 'message-end') {
      const cohereFinishReason = parsedChunk.message.finish_reason;
      let mappedFinishReason: string;
      if (cohereFinishReason === 'COMPLETE') mappedFinishReason = 'stop';
      else if (cohereFinishReason === 'MAX_TOKENS')
        mappedFinishReason = 'length';
      else if (cohereFinishReason === 'TOOL_CALL')
        mappedFinishReason = 'tool_calls';
      else if (cohereFinishReason === 'STOP_SEQUENCE')
        mappedFinishReason = 'stop';
      else mappedFinishReason = cohereFinishReason;

      finishReason = mappedFinishReason;

      if (parsedChunk.message.usage) {
        usage = {
          completion_tokens:
            parsedChunk.message.usage.billed_units?.output_tokens || 0,
          prompt_tokens:
            parsedChunk.message.usage.billed_units?.input_tokens || 0,
          total_tokens:
            (parsedChunk.message.usage.billed_units?.output_tokens || 0) +
            (parsedChunk.message.usage.billed_units?.input_tokens || 0),
        };
      }
    }

    const delta: any = {
      content: deltaContent,
      role: 'assistant',
    };

    if (toolCalls) {
      delta.tool_calls = toolCalls;
    }

    return (
      `data: ${JSON.stringify({
        id: messageId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: gatewayRequest.model || 'command-r-plus',
        provider: COHERE,
        ...(usage && { usage }),
        choices: [
          {
            index: 0,
            delta,
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
      model: gatewayRequest.model || 'command-r-plus',
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
