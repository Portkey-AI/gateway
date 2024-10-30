import { BEDROCK, documentMimeTypes, imagesMimeTypes } from '../../globals';
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
import {
  BedrockAI21CompleteResponse,
  BedrockCohereCompleteResponse,
  BedrockCohereStreamChunk,
} from './complete';
import { BedrockErrorResponse } from './embed';
import {
  transformAdditionalModelRequestFields,
  transformAI21AdditionalModelRequestFields,
  transformAnthropicAdditionalModelRequestFields,
  transformCohereAdditionalModelRequestFields,
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

export interface BedrockConverseAnthropicChatCompletionsParams
  extends BedrockChatCompletionsParams {
  anthropic_version?: string;
  user?: string;
}

export interface BedrockConverseCohereChatCompletionsParams
  extends BedrockChatCompletionsParams {
  frequency_penalty?: number;
  presence_penalty?: number;
  logit_bias?: Record<string, number>;
  n?: number;
}

export interface BedrockConverseAI21ChatCompletionsParams
  extends BedrockChatCompletionsParams {
  frequency_penalty?: number;
  presence_penalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
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
        const mimetypeParts = item.image_url.url.split(';');
        const mimeType = mimetypeParts[0].split(':')[1];
        const fileFormat = mimeType.split('/')[1];
        const bytes = mimetypeParts[1].split(',')[1];
        if (imagesMimeTypes.includes(mimeType)) {
          out.push({
            image: {
              source: {
                bytes,
              },
              format: fileFormat,
            },
          });
        } else if (documentMimeTypes.includes(mimeType)) {
          out.push({
            document: {
              format: fileFormat,
              name: crypto.randomUUID(),
              source: {
                bytes,
              },
            },
          });
        }
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
  max_completion_tokens: {
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

export const BedrockConverseAnthropicChatCompleteConfig: ProviderConfig = {
  ...BedrockConverseChatCompleteConfig,
  additionalModelRequestFields: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAnthropicChatCompletionsParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  top_k: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAnthropicChatCompletionsParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  anthropic_version: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAnthropicChatCompletionsParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  user: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAnthropicChatCompletionsParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
};

export const BedrockConverseCohereChatCompleteConfig: ProviderConfig = {
  ...BedrockConverseChatCompleteConfig,
  additionalModelRequestFields: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  top_k: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  frequency_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  presence_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  logit_bias: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  n: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
  stream: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseCohereChatCompletionsParams) =>
      transformCohereAdditionalModelRequestFields(params),
  },
};

export const BedrockConverseAI21ChatCompleteConfig: ProviderConfig = {
  ...BedrockConverseChatCompleteConfig,
  additionalModelRequestFields: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  top_k: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  frequency_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  presence_penalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  frequencyPenalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  presencePenalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
  countPenalty: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockConverseAI21ChatCompletionsParams) =>
      transformAI21AdditionalModelRequestFields(params),
  },
};

export const BedrockCohereChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (!!params.messages) {
        let messages: Message[] = params.messages;
        messages.forEach((msg, index) => {
          if (index === 0 && msg.role === 'system') {
            prompt += `system: ${messages}\n`;
          } else if (msg.role == 'user') {
            prompt += `user: ${msg.content}\n`;
          } else if (msg.role == 'assistant') {
            prompt += `assistant: ${msg.content}\n`;
          } else {
            prompt += `${msg.role}: ${msg.content}\n`;
          }
        });
        prompt += 'Assistant:';
      }
      return prompt;
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: 20,
    min: 1,
  },
  max_completion_tokens: {
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
  logit_bias: {
    param: 'logit_bias',
  },
  n: {
    param: 'num_generations',
    default: 1,
    min: 1,
    max: 5,
  },
  stop: {
    param: 'end_sequences',
  },
  stream: {
    param: 'stream',
  },
};

export const BedrockCohereChatCompleteResponseTransform: (
  response: BedrockCohereCompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('generations' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.generations.map((generation, index) => ({
        index: index,
        message: {
          role: 'assistant',
          content: generation.text,
        },
        finish_reason: generation.finish_reason,
      })),
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockCohereChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | string[] = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  const parsedChunk: BedrockCohereStreamChunk = JSON.parse(chunk);

  // discard the last cohere chunk as it sends the whole response combined.
  if (parsedChunk.is_finished) {
    return [
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: BEDROCK,
        choices: [
          {
            index: parsedChunk.index ?? 0,
            delta: {},
            finish_reason: parsedChunk.finish_reason,
          },
        ],
        usage: {
          prompt_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount,
          completion_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
          total_tokens:
            parsedChunk['amazon-bedrock-invocationMetrics'].inputTokenCount +
            parsedChunk['amazon-bedrock-invocationMetrics'].outputTokenCount,
        },
      })}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  return `data: ${JSON.stringify({
    id: fallbackId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: BEDROCK,
    choices: [
      {
        index: parsedChunk.index ?? 0,
        delta: {
          role: 'assistant',
          content: parsedChunk.text,
        },
        finish_reason: null,
      },
    ],
  })}\n\n`;
};

export const BedrockAI21ChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (!!params.messages) {
        let messages: Message[] = params.messages;
        messages.forEach((msg, index) => {
          if (index === 0 && msg.role === 'system') {
            prompt += `system: ${messages}\n`;
          } else if (msg.role == 'user') {
            prompt += `user: ${msg.content}\n`;
          } else if (msg.role == 'assistant') {
            prompt += `assistant: ${msg.content}\n`;
          } else {
            prompt += `${msg.role}: ${msg.content}\n`;
          }
        });
        prompt += 'Assistant:';
      }
      return prompt;
    },
  },
  max_tokens: {
    param: 'maxTokens',
    default: 200,
  },
  max_completion_tokens: {
    param: 'maxTokens',
    default: 200,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'topP',
    default: 1,
  },
  stop: {
    param: 'stopSequences',
  },
  presence_penalty: {
    param: 'presencePenalty',
    transform: (params: Params) => {
      return {
        scale: params.presence_penalty,
      };
    },
  },
  frequency_penalty: {
    param: 'frequencyPenalty',
    transform: (params: Params) => {
      return {
        scale: params.frequency_penalty,
      };
    },
  },
  countPenalty: {
    param: 'countPenalty',
  },
  frequencyPenalty: {
    param: 'frequencyPenalty',
  },
  presencePenalty: {
    param: 'presencePenalty',
  },
};

export const BedrockAI21ChatCompleteResponseTransform: (
  response: BedrockAI21CompleteResponse | BedrockErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('completions' in response) {
    const prompt_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Input-Token-Count')) || 0;
    const completion_tokens =
      Number(responseHeaders.get('X-Amzn-Bedrock-Output-Token-Count')) || 0;
    return {
      id: response.id.toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.completions.map((completion, index) => ({
        index: index,
        message: {
          role: 'assistant',
          content: completion.data.text,
        },
        finish_reason: completion.finishReason?.reason,
      })),
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
