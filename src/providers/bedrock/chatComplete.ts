import { BEDROCK } from '../../globals';
import { Message, Params, ToolCall } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { BedrockErrorResponse } from './embed';
import {
  transformAdditionalModelRequestFields,
  transformInferenceConfig,
} from './utils';

export interface BedrockChatCompletionsParams extends Params {
  additionalModelRequestFields?: Record<string, any>;
  additionalModelResponseFieldPaths?: string[];
  guardrailConfig?: {
    guardrailIdentifier: string;
    guardrailVersion: string;
    trace?: string;
  };
  anthropic_version?: string;
  countPenalty?: number;
}

const getMessageTextContentArray = (message: Message): { text: string }[] => {
  if (message.content && typeof message.content === 'object') {
    return message.content
      .filter((item) => item.type === 'text')
      .map((item) => {
        return {
          text: item.text || '',
        };
      });
  }
  return [
    {
      text: message.content || '',
    },
  ];
};

const getMessageContent = (message: Message) => {
  if (!message.content) return [];
  if (message.role === 'tool') {
    return [
      {
        toolResult: {
          content: getMessageTextContentArray(message),
          toolUseId: message.tool_call_id,
        },
      },
    ];
  }
  const out = [];
  // if message is a string, return a single element array with the text
  if (typeof message.content === 'string') {
    out.push({
      text: message.content,
    });
  } else {
    message.content.forEach((item) => {
      if (item.type === 'text') {
        out.push({
          text: item.text || '',
        });
      } else if (item.type === 'image_url' && item.image_url) {
        const imageParts = item.image_url.url.split(';');
        const imageFormat = imageParts[0].split('/')[1];
        out.push({
          image: {
            source: {
              bytes: imageParts[1].split(',')[1],
            },
            format: imageFormat,
          },
        });
      }
    });
  }

  // If message is an array of objects, handle text content, tool calls, tool results, this would be much cleaner if portkeys chat create object were a union type
  message.tool_calls?.forEach((toolCall: ToolCall) => {
    out.push({
      toolUse: {
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments),
        toolUseId: toolCall.id,
      },
    });
  });
  return out;
};

// refer: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
export const BedrockConverseChatCompleteConfig: ProviderConfig = {
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: BedrockChatCompletionsParams) => {
        if (!params.messages) return [];
        return params.messages
          .filter((msg) => msg.role !== 'system')
          .map((msg) => {
            return {
              role: msg.role === 'assistant' ? 'assistant' : 'user',
              content: getMessageContent(msg),
            };
          });
      },
    },
    {
      param: 'system',
      required: false,
      transform: (params: BedrockChatCompletionsParams) => {
        if (!params.messages) return;
        const systemMessages = params.messages.reduce(
          (acc: { text: string }[], msg) => {
            if (msg.role === 'system')
              return acc.concat(...getMessageTextContentArray(msg));
            return acc;
          },
          []
        );
        if (!systemMessages.length) return;
        return systemMessages;
      },
    },
  ],
  tools: {
    param: 'toolConfig',
    transform: (params: BedrockChatCompletionsParams) => {
      const toolConfig = {
        tools: params.tools?.map((tool) => {
          if (!tool.function) return;
          return {
            toolSpec: {
              name: tool.function.name,
              description: tool.function.description,
              inputSchema: { json: tool.function.parameters },
            },
          };
        }),
      };
      let toolChoice = undefined;
      if (params.tool_choice) {
        if (typeof params.tool_choice === 'object') {
          toolChoice = {
            tool: {
              name: params.tool_choice.function.name,
            },
          };
        } else if (typeof params.tool_choice === 'string') {
          if (params.tool_choice === 'required') {
            toolChoice = {
              any: {},
            };
          } else if (params.tool_choice === 'auto') {
            toolChoice = {
              auto: {},
            };
          }
        }
      }
      return { ...toolConfig, toolChoice };
    },
  },
  guardrailConfig: {
    param: 'guardrailConfig',
    required: false,
  },
  additionalModelResponseFieldPaths: {
    param: 'additionalModelResponseFieldPaths',
    required: false,
  },
  max_tokens: {
    param: 'inferenceConfig',
    transform: (params: BedrockChatCompletionsParams) =>
      transformInferenceConfig(params),
  },
  stop: {
    param: 'inferenceConfig',
    transform: (params: BedrockChatCompletionsParams) =>
      transformInferenceConfig(params),
  },
  temperature: {
    param: 'inferenceConfig',
    transform: (params: BedrockChatCompletionsParams) =>
      transformInferenceConfig(params),
  },
  top_p: {
    param: 'inferenceConfig',
    transform: (params: BedrockChatCompletionsParams) =>
      transformInferenceConfig(params),
  },
  additionalModelRequestFields: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  top_k: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  anthropic_version: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  frequency_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  presence_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  logit_bias: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  n: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  stream: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
  countPenalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockChatCompletionsParams) =>
      transformAdditionalModelRequestFields(params),
  },
};

interface BedrockChatCompletionResponse {
  metrics: {
    latencyMs: number;
  };
  output: {
    message: {
      role: string;
      content: [
        {
          text: string;
          toolUse: {
            toolUseId: string;
            name: string;
            input: object;
          };
        },
      ];
    };
  };
  stopReason: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export const BedrockErrorResponseTransform: (
  response: BedrockErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('message' in response) {
    return generateErrorResponse(
      { message: response.message, type: null, param: null, code: null },
      BEDROCK
    );
  }

  return undefined;
};

export const BedrockChatCompleteResponseTransform: (
  response: BedrockChatCompletionResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('output' in response) {
    const responseObj: ChatCompletionResponse = {
      id: Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.output.message.content
              .filter((content) => content.text)
              .reduce((acc, content) => acc + content.text + '\n', ''),
          },
          finish_reason: response.stopReason,
        },
      ],
      usage: {
        prompt_tokens: response.usage.inputTokens,
        completion_tokens: response.usage.outputTokens,
        total_tokens: response.usage.totalTokens,
      },
    };
    const toolCalls = response.output.message.content
      .filter((content) => content.toolUse)
      .map((content) => ({
        id: content.toolUse.toolUseId,
        type: 'function',
        function: {
          name: content.toolUse.name,
          arguments: content.toolUse.input,
        },
      }));
    if (toolCalls.length > 0)
      responseObj.choices[0].message.tool_calls = toolCalls;
    return responseObj;
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export interface BedrockChatCompleteStreamChunk {
  contentBlockIndex?: number;
  delta?: {
    text: string;
    toolUse: {
      toolUseId: string;
      name: string;
      input: object;
    };
  };
  stopReason?: string;
  metrics?: {
    latencyMs: number;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

interface BedrockStreamState {
  stopReason?: string;
}

// refer: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html
export const BedrockChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: BedrockStreamState
) => string | string[] = (responseChunk, fallbackId, streamState) => {
  const parsedChunk: BedrockChatCompleteStreamChunk = JSON.parse(responseChunk);
  if (parsedChunk.stopReason) {
    streamState.stopReason = parsedChunk.stopReason;
  }

  if (parsedChunk.usage) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: streamState.stopReason,
          },
        ],
        usage: {
          prompt_tokens: parsedChunk.usage.inputTokens,
          completion_tokens: parsedChunk.usage.outputTokens,
          total_tokens: parsedChunk.usage.totalTokens,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  const toolCalls = [];
  if (parsedChunk.delta?.toolUse) {
    toolCalls.push({
      id: parsedChunk.delta.toolUse.toolUseId,
      type: 'function',
      function: {
        name: parsedChunk.delta.toolUse.name,
        arguments: parsedChunk.delta.toolUse.input,
      },
    });
  }

  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        index: parsedChunk.contentBlockIndex ?? 0,
        delta: {
          role: 'assistant',
          content: parsedChunk.delta?.text,
          tool_calls: toolCalls,
        },
      },
    ],
  })}\n\n`;
};
