import { ORACLE } from '../../globals';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import type {
  CustomToolChoice,
  Options,
  Params,
} from '../../types/requestBody';
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
  ChatContent,
  Message,
  OracleMessageRole,
  ToolDefinition,
} from './types/ChatDetails';
import {
  ChatChoice,
  OracleChatCompleteResponse,
  OracleErrorResponse,
  ToolCall,
} from './types/GenericChatResponse';
import { openAIToOracleRoleMap, oracleToOpenAIRoleMap } from './utils';

/**
 * Stream state for tracking tool calls across streaming chunks.
 * OCI sends tool calls in the message together with finishReason, so we need to
 * track seen tool call IDs to assign stable indices for OpenAI-format deltas.
 */
export interface OracleStreamState {
  currentToolCallIndex: number;
  seenToolCallIds: Set<string>;
  finishReason?: string;
}

export const initOracleStreamState = (): OracleStreamState => ({
  currentToolCallIndex: -1,
  seenToolCallIds: new Set(),
});

// transforms from openai format to oracle format for chat completions request
export const OracleChatCompleteConfig: ProviderConfig = {
  model: [
    {
      param: 'chatRequest',
      required: true,
      transform: (params: Params, providerOptions: Options) => {
        return transformUsingProviderConfig(
          OracleChatDetailsConfig,
          params,
          providerOptions
        );
      },
    },
    {
      param: 'compartmentId',
      required: true,
      transform: (_: Params, providerOptions: Options) => {
        return providerOptions?.oracleCompartmentId;
      },
    },
    {
      param: 'servingMode',
      required: true,
      default: 'ON_DEMAND', // supported values: ON_DEMAND, DEDICATED
      transform: (params: Params, providerOptions: Options) => {
        return {
          servingType: providerOptions.oracleServingMode || 'ON_DEMAND',
          modelId: params.model,
        };
      },
    },
  ],
};

export const OracleChatDetailsConfig: ProviderConfig = {
  frequency_penalty: {
    param: 'frequencyPenalty',
    min: -2,
    max: 2,
  },
  messages: {
    param: 'messages',
    default: '',
    transform: (params: Params): Message[] => {
      const transformedMessages: Message[] = [];
      for (const message of params.messages || []) {
        const role = openAIToOracleRoleMap[message.role];
        const content: ChatContent[] = [];
        if (typeof message.content === 'string') {
          content.push({
            type: 'TEXT',
            text: message.content,
          });
        } else if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (typeof item === 'string') {
              content.push({
                type: 'TEXT',
                text: item,
              });
            } else if (item.type === 'image_url' && item.image_url?.url) {
              content.push({
                type: 'IMAGE',
                imageUrl: {
                  url: item.image_url.url,
                  detail: item.image_url.detail,
                },
              });
            } else if (item.type === 'input_audio' && item.input_audio?.data) {
              content.push({
                type: 'AUDIO',
                audioUrl: {
                  url: item.input_audio.data,
                },
              });
            }
          }
        }
        const toolCalls: ToolCall[] = [];
        if (message.tool_calls) {
          for (const toolCall of message.tool_calls) {
            if (toolCall.type === 'function') {
              toolCalls.push({
                id: toolCall.id,
                type: 'FUNCTION',
                arguments: toolCall.function.arguments,
                name: toolCall.function.name,
              });
            } else if (toolCall.type === 'custom') {
              toolCalls.push({
                id: toolCall.id,
                type: 'FUNCTION',
                name: toolCall.custom.name,
                arguments: toolCall.custom.input,
              });
            }
          }
        }
        const transformedMessage: Message = {
          role,
          content,
        };

        if (toolCalls.length > 0) {
          transformedMessage.toolCalls = toolCalls;
        }

        if (message.role === 'tool' && message.tool_call_id) {
          transformedMessage.toolCallId = message.tool_call_id;
        }

        transformedMessages.push(transformedMessage);
      }
      return transformedMessages;
    },
  },
  max_tokens: {
    param: 'maxTokens',
    default: 100,
    min: 0,
  },
  max_completion_tokens: {
    param: 'maxTokens',
    default: 100,
    min: 0,
  },
  n: {
    param: 'numGenerations',
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  tool_choice: {
    param: 'toolChoice',
    required: false,
    transform: (params: Params) => {
      if (typeof params.tool_choice === 'string') {
        return {
          type: params.tool_choice.toUpperCase(),
        };
      } else if (typeof params.tool_choice === 'object') {
        if (params.tool_choice?.type === 'custom') {
          return {
            type: 'FUNCTION',
            name: (params.tool_choice as CustomToolChoice)?.custom?.name,
          };
        } else if (params.tool_choice?.type === 'function') {
          return {
            type: 'FUNCTION',
            name: params.tool_choice?.function?.name,
          };
        }
      }
    },
  },
  tools: {
    param: 'tools',
    transform: (params: Params): ToolDefinition[] | undefined => {
      if (!params.tools) return undefined;
      const transformedTools: ToolDefinition[] = [];
      for (const tool of params.tools) {
        if (tool.type === 'function') {
          transformedTools.push({
            type: 'FUNCTION',
            description: tool.function?.description,
            parameters: tool.function?.parameters,
            name: tool.function?.name,
          });
        } else if (tool.type === 'custom') {
          transformedTools.push({
            type: 'FUNCTION',
            description: tool.custom.description,
            name: tool.custom.name,
          });
        }
      }
      return transformedTools.length > 0 ? transformedTools : undefined;
    },
  },
  top_p: {
    param: 'topP',
    default: 1,
    min: 0,
    max: 1,
  },
  logit_bias: {
    param: 'logitBias',
  },
  logprobs: {
    param: 'logProbs',
  },
  presence_penalty: {
    param: 'presencePenalty',
    min: -2,
    max: 2,
  },
  seed: {
    param: 'seed',
  },
  stream: {
    param: 'isStream',
    default: false,
  },
  stop: {
    param: 'stop',
    transform: (params: Params) => {
      if (params.stop && !Array.isArray(params.stop)) {
        return [params.stop];
      }
      return params.stop;
    },
  },
  // oracle specific
  compartment_id: {
    param: 'compartmentId',
    required: false,
  },
  serving_mode: {
    param: 'servingMode',
    required: false,
  },
  api_format: {
    param: 'apiFormat',
    default: 'GENERIC',
    required: true,
  },
  is_echo: {
    param: 'isEcho',
  },
  top_k: {
    param: 'topK',
  },
};

export const OracleChatCompleteResponseTransform: (
  response: OracleChatCompleteResponse | OracleErrorResponse,
  responseStatus: number,
  responseHeaders: Headers
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  responseHeaders
) => {
  if (responseStatus !== 200 && 'code' in response) {
    return generateErrorResponse(
      {
        message: response.message || 'Unknown error',
        type: response.code?.toString() || null,
        param: null,
        code: response.code?.toString() || null,
      },
      ORACLE
    );
  }

  if ('chatResponse' in response) {
    return {
      id: responseHeaders.get('opc-request-id') || crypto.randomUUID(),
      object: 'chat.completion',
      created:
        new Date(response.chatResponse.timeCreated).getTime() / 1000 ||
        Math.floor(Date.now() / 1000),
      model: response.modelId,
      provider: ORACLE,
      choices: response.chatResponse.choices.map((choice: ChatChoice) => {
        const content = choice.message?.content?.find(
          (item) => item.type === 'TEXT'
        )?.text;

        const toolCalls = (choice.message as any)?.toolCalls?.map(
          (tc: ToolCall, index: number) => ({
            id: tc.id || `call_${Date.now().toString(36)}_${index}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments:
                typeof tc.arguments === 'string'
                  ? tc.arguments
                  : JSON.stringify(tc.arguments),
            },
          })
        );

        return {
          index: choice.index,
          message: {
            role: oracleToOpenAIRoleMap[
              choice.message.role as OracleMessageRole
            ],
            content,
            ...(toolCalls && toolCalls.length > 0 && { tool_calls: toolCalls }),
          },
          finish_reason: choice.finishReason,
        };
      }),
      usage: {
        prompt_tokens: response.chatResponse.usage?.promptTokens ?? 0,
        completion_tokens: response.chatResponse.usage?.completionTokens ?? 0,
        total_tokens: response.chatResponse.usage?.totalTokens ?? 0,
        completion_tokens_details: {
          accepted_prediction_tokens:
            response.chatResponse.usage?.completionTokensDetails
              ?.acceptedPredictionTokens ?? 0,
          audio_tokens:
            response.chatResponse.usage?.completionTokensDetails?.audioTokens ??
            0,
          rejected_prediction_tokens:
            response.chatResponse.usage?.completionTokensDetails
              ?.rejectedPredictionTokens ?? 0,
        },
        prompt_tokens_details: {
          audio_tokens:
            response.chatResponse.usage?.promptTokensDetails?.audioTokens ?? 0,
          cached_tokens:
            response.chatResponse.usage?.promptTokensDetails?.cachedTokens ?? 0,
        },
      },
    };
  }

  return generateInvalidProviderResponseError(response, ORACLE);
};

export const OracleChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: OracleStreamState,
  _strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string | string[] | undefined = (
  responseChunk,
  fallbackId,
  streamState,
  _strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();
  if (chunk.startsWith('event: ping')) {
    return;
  }

  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return 'data: [DONE]\n\n';
  }

  if (streamState.currentToolCallIndex === undefined) {
    streamState.currentToolCallIndex = -1;
    streamState.seenToolCallIds = new Set();
  }

  const parsedChunk: ChatChoice = JSON.parse(chunk);

  if (parsedChunk.finishReason) {
    streamState.finishReason = parsedChunk.finishReason;
  }

  // Map OCI toolCalls to OpenAI tool_calls deltas with stable indices.
  // OCI emits tool calls in the same chunk as finishReason, so we must split
  // them across two SSE events: first the tool_calls delta, then the finish.
  const rawToolCalls = (parsedChunk.message as any)?.toolCalls || [];
  const toolCalls: Array<{
    index: number;
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }> = [];

  for (const tc of rawToolCalls) {
    if (!streamState.seenToolCallIds.has(tc.id)) {
      streamState.currentToolCallIndex++;
      streamState.seenToolCallIds.add(tc.id);
    }
    const toolCallIndex = Array.from(streamState.seenToolCallIds).indexOf(
      tc.id
    );
    toolCalls.push({
      index:
        toolCallIndex >= 0 ? toolCallIndex : streamState.currentToolCallIndex,
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments:
          typeof tc.arguments === 'string'
            ? tc.arguments
            : JSON.stringify(tc.arguments),
      },
    });
  }

  if (parsedChunk.finishReason) {
    const chunks: string[] = [];

    if (toolCalls.length > 0) {
      chunks.push(
        `data: ${JSON.stringify({
          id: fallbackId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: gatewayRequest.model || '',
          provider: ORACLE,
          choices: [
            {
              index: 0,
              delta: { tool_calls: toolCalls },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    }

    chunks.push(
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: gatewayRequest.model || '',
        provider: ORACLE,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: parsedChunk.finishReason,
          },
        ],
      })}\n\n`
    );
    chunks.push('data: [DONE]\n\n');

    return chunks;
  }

  const content = parsedChunk.message?.content?.find(
    (item) => item.type === 'TEXT'
  )?.text;

  const delta: Record<string, unknown> = {};
  if (parsedChunk.message?.role) {
    delta.role =
      oracleToOpenAIRoleMap[parsedChunk.message.role as OracleMessageRole];
  }
  if (content) {
    delta.content = content;
  }
  if (toolCalls.length > 0) {
    delta.tool_calls = toolCalls;
  }

  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: ORACLE,
      choices: [
        {
          index: parsedChunk.index ?? 0,
          delta,
        },
      ],
    })}` + '\n\n'
  );
};
