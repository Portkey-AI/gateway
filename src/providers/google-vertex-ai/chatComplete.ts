// Docs for REST API
// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/send-multimodal-prompts#gemini-send-multimodal-samples-drest

import { GOOGLE_VERTEX_AI } from '../../globals';
import {
  ContentType,
  Message,
  Params,
  ToolCall,
  SYSTEM_MESSAGE_ROLES,
  MESSAGE_ROLES,
  Options,
} from '../../types/requestBody';
import { AnthropicChatCompleteConfig } from '../anthropic/chatComplete';
import {
  GoogleMessage,
  GoogleMessageRole,
  GoogleToolConfig,
  SYSTEM_INSTRUCTION_DISABLED_MODELS,
  transformOpenAIRoleToGoogleRole,
  transformToolChoiceForGemini,
} from '../google/chatComplete';
import { GOOGLE_GENERATE_CONTENT_FINISH_REASON } from '../google/types';
import {
  ChatCompletionResponse,
  ErrorResponse,
  Logprobs,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';
import { transformGenerationConfig } from './transformGenerationConfig';
import {
  type GoogleErrorResponse,
  type GoogleGenerateContentResponse,
  type VertexLlamaChatCompleteStreamChunk,
  type VertexLLamaChatCompleteResponse,
  THOUGHT_SIGNATURE_PREFIX,
} from './types';
import {
  getMimeType,
  getThoughtSignature,
  googleTools,
  recursivelyDeleteUnsupportedParameters,
  transformGeminiToolParameters,
  transformGoogleTools,
  transformInputAudioPart,
  transformVertexLogprobs,
} from './utils';
import { getOrGenerateId } from '../../utils/idGenerator';

export const VertexGoogleChatCompleteConfig: ProviderConfig = {
  // https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versioning#gemini-model-versions
  model: {
    param: 'model',
    required: true,
    default: 'gemini-1.0-pro',
  },
  messages: [
    {
      param: 'contents',
      default: '',
      transform: (params: Params) => {
        let lastRole: GoogleMessageRole | undefined;
        const messages: GoogleMessage[] = [];

        params.messages?.forEach((message: Message) => {
          // From gemini-1.5 onwards, systemInstruction is supported
          // Skipping system message and sending it in systemInstruction for gemini 1.5 models
          if (
            SYSTEM_MESSAGE_ROLES.includes(message.role) &&
            !SYSTEM_INSTRUCTION_DISABLED_MODELS.includes(params.model as string)
          )
            return;

          const role = transformOpenAIRoleToGoogleRole(message.role);
          let parts = [];

          if (message.role === 'assistant' && message.tool_calls) {
            message.tool_calls.forEach((tool_call: ToolCall) => {
              const thought_signature = getThoughtSignature(
                params.model,
                tool_call.function.thought_signature
              );
              parts.push({
                functionCall: {
                  name: tool_call.function?.name,
                  args: JSON.parse(tool_call.function.arguments),
                },
                ...(thought_signature && {
                  thoughtSignature: thought_signature,
                }),
              });
            });
          } else if (message.role === 'tool') {
            const toolName = message.name ?? 'gateway-tool-filler-name';
            // OpenAI: tool message content is string or array of text parts (type "text").
            if (typeof message.content === 'string') {
              parts.push({
                functionResponse: {
                  name: toolName,
                  response: {
                    content: message.content,
                  },
                },
              });
            } else if (Array.isArray(message.content)) {
              (message.content as ContentType[]).forEach((part) => {
                parts.push({
                  functionResponse: {
                    name: toolName,
                    response: {
                      content: part.text,
                    },
                  },
                });
              });
            }
          } else if (message.content && typeof message.content === 'object') {
            message.content.forEach((c: ContentType) => {
              if (c.type === 'text') {
                parts.push({
                  text: c.text,
                });
              } else if (c.type === 'input_audio') {
                parts.push(transformInputAudioPart(c));
              } else if (c.type === 'image_url') {
                const {
                  url,
                  mime_type: passedMimeType,
                  media_resolution,
                } = c.image_url || {};

                if (!url) {
                  // Shouldn't throw error?
                  return;
                }

                // Example: data:image/png;base64,abcdefg...
                if (url.startsWith('data:')) {
                  const [mimeTypeWithPrefix, base64Image] =
                    url.split(';base64,');
                  const mimeType = mimeTypeWithPrefix.split(':')[1];

                  parts.push({
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Image,
                    },
                    ...(media_resolution && {
                      mediaResolution: media_resolution,
                    }),
                  });

                  return;
                } else if (
                  url.startsWith('gs://') ||
                  url.startsWith('https://') ||
                  url.startsWith('http://')
                ) {
                  parts.push({
                    fileData: {
                      mimeType: passedMimeType || getMimeType(url),
                      fileUri: url,
                    },
                    ...(media_resolution && {
                      mediaResolution: media_resolution,
                    }),
                  });
                } else {
                  // NOTE: This block is kept to maintain backward compatibility
                  // Earlier we were assuming that all images will be base64 with image/jpeg mimeType
                  parts.push({
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: c.image_url?.url,
                    },
                    ...(media_resolution && {
                      mediaResolution: media_resolution,
                    }),
                  });
                }
              }
            });
          } else if (typeof message.content === 'string') {
            parts.push({
              text: message.content,
            });
          }

          // @NOTE: This takes care of the "Please ensure that multiturn requests alternate between user and model."
          // error that occurs when we have multiple user messages in a row.
          const shouldCombineMessages =
            lastRole === role && !params.model?.includes('vision');

          if (shouldCombineMessages) {
            messages[messages.length - 1].parts.push(...parts);
          } else {
            messages.push({ role, parts });
          }

          lastRole = role;
        });

        return messages;
      },
    },
    {
      param: 'systemInstruction',
      default: '',
      transform: (params: Params) => {
        // systemInstruction is only supported from gemini 1.5 models
        if (SYSTEM_INSTRUCTION_DISABLED_MODELS.includes(params.model as string))
          return;
        const firstMessage = params.messages?.[0] || null;
        if (!firstMessage) return;

        if (
          SYSTEM_MESSAGE_ROLES.includes(firstMessage.role) &&
          typeof firstMessage.content === 'string'
        ) {
          return {
            parts: [
              {
                text: firstMessage.content,
              },
            ],
            role: 'system',
          };
        }

        if (
          SYSTEM_MESSAGE_ROLES.includes(firstMessage.role) &&
          typeof firstMessage.content === 'object' &&
          firstMessage.content?.[0]?.text
        ) {
          return {
            parts: [
              {
                text: firstMessage.content?.[0].text,
              },
            ],
            role: 'system',
          };
        }

        return;
      },
    },
  ],
  temperature: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  top_p: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  top_k: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  max_tokens: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  max_completion_tokens: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  stop: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  response_format: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  logprobs: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  top_logprobs: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  // https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-attributes
  // Example payload to be included in the request that sets the safety settings:
  //   "safety_settings": [
  //     {
  //         "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
  //         "threshold": "BLOCK_NONE"
  //     },
  //     {
  //         "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  //         "threshold": "BLOCK_ONLY_HIGH"
  //     }
  // ]
  safety_settings: {
    param: 'safety_settings',
  },
  tools: {
    param: 'tools',
    default: '',
    transform: (params: Params) => {
      const functionDeclarations: any = [];
      const tools: any = [];
      params.tools?.forEach((tool) => {
        if (tool.type === 'function') {
          if (googleTools.includes(tool.function?.name)) {
            tools.push(...transformGoogleTools(tool));
          } else {
            if (tool.function) {
              const transformedParameters = transformGeminiToolParameters(
                tool.function.parameters || {}
              );
              tool.function.parameters = recursivelyDeleteUnsupportedParameters(
                transformedParameters
              );
              delete tool.function.strict;
              functionDeclarations.push(tool.function);
            }
          }
        }
      });
      if (functionDeclarations.length) {
        tools.push({ functionDeclarations });
      }
      return tools;
    },
  },
  tool_choice: {
    param: 'tool_config',
    default: (params: Params) => {
      const toolConfig = {} as GoogleToolConfig;
      const googleMapsTool = params.tools?.find(
        (tool) =>
          tool.function?.name === 'googleMaps' ||
          tool.function?.name === 'google_maps'
      );
      if (googleMapsTool) {
        toolConfig.retrievalConfig =
          googleMapsTool.function?.parameters?.retrievalConfig;
        return toolConfig;
      }
      return;
    },
    required: true,
    transform: (params: Params) => {
      const toolConfig = {} as GoogleToolConfig;
      if (params.tool_choice) {
        const allowedFunctionNames: string[] = [];
        if (
          typeof params.tool_choice === 'object' &&
          params.tool_choice.type === 'function'
        ) {
          allowedFunctionNames.push(params.tool_choice.function?.name);
        }

        toolConfig.function_calling_config = {
          mode: transformToolChoiceForGemini(params.tool_choice),
        };
        if (allowedFunctionNames.length > 0) {
          toolConfig.function_calling_config.allowed_function_names =
            allowedFunctionNames;
        }
      }

      const googleMapsTool = params.tools?.find(
        (tool) =>
          tool.function?.name === 'googleMaps' ||
          tool.function?.name === 'google_maps'
      );
      if (googleMapsTool) {
        toolConfig.retrievalConfig =
          googleMapsTool.function?.parameters?.retrievalConfig;
      }
      return toolConfig;
    },
  },
  labels: {
    param: 'labels',
  },
  thinking: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  seed: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  modalities: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  reasoning_effort: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  image_config: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  // https://ai.google.dev/gemini-api/docs/media-resolution
  media_resolution: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  cached_content: {
    param: 'cachedContent',
  },
};

interface AnthorpicTextContentItem {
  type: 'text';
  text: string;
}

interface AnthropicThinkingContentItem {
  type: 'thinking';
  thinking: string;
  signature: string;
}

interface AnthropicToolContentItem {
  type: 'tool_use';
  name: string;
  id: string;
  input: Record<string, any>;
}

type AnthropicContentItem =
  | AnthorpicTextContentItem
  | AnthropicThinkingContentItem
  | AnthropicToolContentItem;

export const VertexAnthropicChatCompleteConfig: ProviderConfig = {
  ...AnthropicChatCompleteConfig,
  anthropic_version: {
    param: 'anthropic_version',
    required: true,
    default: 'vertex-2023-10-16',
    transform: (params: Params, providerOptions?: Options) => {
      return (
        providerOptions?.anthropicVersion ||
        params.anthropic_version ||
        'vertex-2023-10-16'
      );
    },
  },
  model: {
    param: 'model',
    required: false,
    transform: () => {
      return undefined;
    },
  },
};

export const GoogleChatCompleteResponseTransform: (
  response:
    | GoogleGenerateContentResponse
    | GoogleErrorResponse
    | GoogleErrorResponse[],
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
  // when error occurs on streaming request, the response is an array of errors.
  if (
    responseStatus !== 200 &&
    Array.isArray(response) &&
    response.length > 0 &&
    'error' in response[0]
  ) {
    const { error } = response[0];

    return generateErrorResponse(
      {
        message: error.message,
        type: error.status,
        param: null,
        code: String(error.code),
      },
      GOOGLE_VERTEX_AI
    );
  }

  if (responseStatus !== 200 && 'error' in response) {
    const { error } = response;
    return generateErrorResponse(
      {
        message: error.message,
        type: error.status,
        param: null,
        code: String(error.code),
      },
      GOOGLE_VERTEX_AI
    );
  }

  // sometimes vertex gemini returns usageMetadata without candidates
  const isValidResponse =
    'candidates' in response || 'usageMetadata' in response;
  if (isValidResponse) {
    const {
      promptTokenCount = 0,
      cachedContentTokenCount = 0,
      candidatesTokenCount = 0,
      totalTokenCount = 0,
      thoughtsTokenCount = 0,
    } = response.usageMetadata;

    const completionTokens = candidatesTokenCount + thoughtsTokenCount;

    return {
      id: getOrGenerateId(undefined, 'chatCompletion'),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.modelVersion,
      provider: GOOGLE_VERTEX_AI,
      choices:
        response.candidates?.map((generation, index) => {
          // transform tool calls and content by iterating over the content parts
          const toolCalls: ToolCall[] = [];
          let content: string | undefined;
          const contentBlocks = [];
          for (const part of generation.content?.parts ?? []) {
            if (part.functionCall) {
              toolCalls.push({
                id: getOrGenerateId(undefined, 'toolCall'),
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args),
                  ...(!strictOpenAiCompliance &&
                    part.thoughtSignature && {
                      thought_signature: part.thoughtSignature,
                    }),
                },
              });
            } else if (part.text) {
              if (part.thought) {
                contentBlocks.push({ type: 'thinking', thinking: part.text });
              } else {
                content = content ? content + part.text : part.text;
                contentBlocks.push({ type: 'text', text: part.text });
              }
            } else if (part.inlineData) {
              contentBlocks.push({
                type: 'image_url',
                image_url: {
                  url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                },
              });
            }
          }

          // Handle cases where content is empty (e.g., MALFORMED_FUNCTION_CALL)
          // If no content was extracted but finishMessage is available, use it as content
          if (
            content === undefined &&
            toolCalls.length === 0 &&
            generation.finishMessage
          ) {
            content = generation.finishMessage;
          }

          const message = {
            role: MESSAGE_ROLES.ASSISTANT,
            ...(toolCalls.length && { tool_calls: toolCalls }),
            ...(content && { content }),
            ...(!strictOpenAiCompliance &&
              contentBlocks.length && { content_blocks: contentBlocks }),
          };
          const logprobsContent: Logprobs[] | null =
            transformVertexLogprobs(generation);
          let logprobs;
          if (logprobsContent) {
            logprobs = {
              content: logprobsContent,
            };
          }

          return {
            message: message,
            index: index,
            finish_reason:
              toolCalls.length > 0
                ? 'tool_calls'
                : transformFinishReason(
                    generation.finishReason as GOOGLE_GENERATE_CONTENT_FINISH_REASON,
                    strictOpenAiCompliance
                  ),
            logprobs,
            ...(!strictOpenAiCompliance && {
              safetyRatings: generation.safetyRatings,
            }),
            ...(!strictOpenAiCompliance && generation.groundingMetadata
              ? { groundingMetadata: generation.groundingMetadata }
              : {}),
          };
        }) ?? [],
      usage: {
        prompt_tokens: promptTokenCount,
        completion_tokens: completionTokens,
        total_tokens: totalTokenCount,
        completion_tokens_details: {
          reasoning_tokens: thoughtsTokenCount,
        },
        prompt_tokens_details: {
          cached_tokens: cachedContentTokenCount,
        },
      },
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};

export const VertexLlamaChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'meta/llama-3.1-405b-instruct-maas',
    transform: (params: Params) => {
      return (
        params.model?.replace('meta.', 'meta/') ||
        'meta/llama-3.1-405b-instruct-maas'
      );
    },
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
  },
  max_tokens: {
    param: 'max_tokens',
    default: 512,
    min: 1,
    max: 2048,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 512,
    min: 1,
    max: 2048,
  },
  temperature: {
    param: 'temperature',
    default: 0.5,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: 0.9,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'top_k',
    default: 0,
    min: 0,
    max: 2048,
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

export const GoogleChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: any,
  strictOpenAiCompliance: boolean
) => string = (
  responseChunk,
  fallbackId,
  streamState,
  strictOpenAiCompliance
) => {
  streamState.containsChainOfThoughtMessage =
    streamState?.containsChainOfThoughtMessage ?? false;
  const chunk = responseChunk
    .trim()
    .replace(/^data: /, '')
    .trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: GoogleGenerateContentResponse = JSON.parse(chunk);

  let usageMetadata;
  if (parsedChunk.usageMetadata) {
    const {
      promptTokenCount = 0,
      cachedContentTokenCount = 0,
      candidatesTokenCount = 0,
      totalTokenCount = 0,
      thoughtsTokenCount = 0,
    } = parsedChunk.usageMetadata;
    const completionTokens = candidatesTokenCount + thoughtsTokenCount;

    usageMetadata = {
      prompt_tokens: promptTokenCount,
      completion_tokens: completionTokens,
      total_tokens: totalTokenCount,
      completion_tokens_details: {
        reasoning_tokens: thoughtsTokenCount,
      },
      prompt_tokens_details: {
        cached_tokens: cachedContentTokenCount,
      },
    };
  }

  const dataChunk = {
    id: fallbackId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: parsedChunk.modelVersion,
    provider: GOOGLE_VERTEX_AI,
    choices:
      parsedChunk.candidates?.map((generation, index) => {
        const hasToolCalls = generation.content?.parts?.some(
          (part) => part.functionCall
        );
        const finishReason = generation.finishReason
          ? hasToolCalls
            ? 'tool_calls'
            : transformFinishReason(
                parsedChunk.candidates[0]
                  .finishReason as GOOGLE_GENERATE_CONTENT_FINISH_REASON,
                strictOpenAiCompliance
              )
          : null;
        let message: any = { role: 'assistant', content: '' };
        if (generation.content?.parts?.[0]?.text) {
          const contentBlocks = [];
          let content = '';
          for (const part of generation.content.parts) {
            if (part.thought) {
              contentBlocks.push({
                index: 0,
                delta: { thinking: part.text },
              });
              streamState.containsChainOfThoughtMessage = true;
            } else {
              content += part.text ?? '';
              contentBlocks.push({
                index: streamState.containsChainOfThoughtMessage ? 1 : 0,
                delta: { text: part.text },
              });
            }
          }
          message = {
            role: 'assistant',
            content,
            ...(!strictOpenAiCompliance &&
              contentBlocks.length && { content_blocks: contentBlocks }),
          };
        } else if (generation.content?.parts?.[0]?.functionCall) {
          message = {
            role: 'assistant',
            tool_calls: generation.content.parts.map((part, idx) => {
              if (part.functionCall) {
                return {
                  index: idx,
                  id: getOrGenerateId(undefined, 'toolCall'),
                  type: 'function',
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args),
                    ...(!strictOpenAiCompliance &&
                      part.thoughtSignature && {
                        thought_signature: part.thoughtSignature,
                      }),
                  },
                };
              }
            }),
          };
        } else if (generation.content?.parts?.[0]?.inlineData) {
          const part = generation.content.parts[0];
          const contentBlocks = [
            {
              index: streamState.containsChainOfThoughtMessage ? 1 : 0,
              delta: {
                type: 'image_url',
                image_url: {
                  url: `data:${part.inlineData?.mimeType};base64,${part.inlineData?.data}`,
                },
              },
            },
          ];
          message = {
            role: 'assistant',
            content_blocks: contentBlocks,
          };
        } else if (generation.finishMessage) {
          // Handle cases where content is empty (e.g., MALFORMED_FUNCTION_CALL)
          message = {
            role: 'assistant',
            content: generation.finishMessage,
          };
        }
        return {
          delta: message,
          index: index,
          finish_reason: finishReason,
          ...(!strictOpenAiCompliance && {
            safetyRatings: generation.safetyRatings,
          }),
          ...(!strictOpenAiCompliance && generation.groundingMetadata
            ? { groundingMetadata: generation.groundingMetadata }
            : {}),
        };
      }) ?? [],
    ...(parsedChunk.usageMetadata?.candidatesTokenCount && {
      usage: usageMetadata,
    }),
  };

  return `data: ${JSON.stringify(dataChunk)}\n\n`;
};

export const VertexLlamaChatCompleteResponseTransform: (
  response: VertexLLamaChatCompleteResponse | GoogleErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (
    responseStatus !== 200 &&
    Array.isArray(response) &&
    response.length > 0 &&
    'error' in response[0]
  ) {
    const { error } = response[0];

    return generateErrorResponse(
      {
        message: error.message,
        type: error.status,
        param: null,
        code: String(error.code),
      },
      GOOGLE_VERTEX_AI
    );
  }
  if ('choices' in response) {
    return {
      id: getOrGenerateId(undefined, 'chatCompletion'),
      created: Math.floor(Date.now() / 1000),
      provider: GOOGLE_VERTEX_AI,
      ...response,
    };
  }
  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};

export const VertexLlamaChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  const parsedChunk: VertexLlamaChatCompleteStreamChunk = JSON.parse(chunk);
  parsedChunk.id = parsedChunk.id || fallbackId;
  parsedChunk.created = Math.floor(Date.now() / 1000);
  parsedChunk.provider = GOOGLE_VERTEX_AI;
  return `data: ${JSON.stringify(parsedChunk)}` + '\n\n';
};
