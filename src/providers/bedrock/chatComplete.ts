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
    message.content
      .filter((item) => item.type === 'text')
      .forEach((item) => {
        out.push({
          text: item.text || '',
        });
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

export const BedrockConverseChatCompleteConfig: ProviderConfig = {
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: Params) => {
        if (!params.messages) return [];
        return params.messages.map((msg) => {
          if (msg.role === 'system') return;
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
      transform: (params: Params) => {
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
    {
      param: 'inferenceConfig',
      transform: (params: Params) => {
        return {
          maxTokens: params.max_tokens,
          stopSequences:
            typeof params.stop === 'string' ? [params.stop] : params.stop,
          temperature: params.temperature,
          topP: params.top_p,
        };
      },
    },
    {
      param: 'additionalModelRequestFields',
      transform: (params: Params) => {
        return {
          topK: params.top_k,
        };
      },
    },
  ],
  tools: {
    param: 'toolConfig',
    transform: (params: Params) => {
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
      if (params.tool_choice) {
        if (typeof params.tool_choice === 'object') {
          return {
            tool: {
              name: params.tool_choice.function.name,
            },
          };
        }
        switch (params.tool_choice) {
          case 'required':
            return {
              any: {},
            };
          case 'auto':
            return {
              auto: {},
            };
        }
      }
      return toolConfig;
    },
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
            tool_calls: response.output.message.content
              .filter((content) => content.toolUse)
              .map((content) => ({
                id: content.toolUse.toolUseId,
                type: 'function',
                function: {
                  name: content.toolUse.name,
                  arguments: content.toolUse.input,
                },
              })),
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
    if (response.output.message.content[0].toolUse) {
      const toolUse = response.output.message.content[0].toolUse;
      responseObj.choices[0].message.tool_calls = [
        {
          id: toolUse.toolUseId,
          type: 'function',
          function: {
            name: toolUse.name,
            arguments: toolUse.input,
          },
        },
      ];
    }
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

export const BedrockChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: BedrockStreamState
) => string | string[] = (responseChunk, fallbackId, streamState) => {
  const parsedChunk: BedrockChatCompleteStreamChunk = JSON.parse(responseChunk);
  if (parsedChunk.stopReason) {
    streamState.stopReason = parsedChunk.stopReason;
  }
  console.log(JSON.stringify(parsedChunk, null, 4));

  // // discard the last cohere chunk as it sends the whole response combined.
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
