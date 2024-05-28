// Docs for REST API
// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/send-multimodal-prompts#gemini-send-multimodal-samples-drest

import { GOOGLE_VERTEX_AI } from '../../globals';
import { ContentType, Message, Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { transformGenerationConfig } from './transformGenerationConfig';
import type {
  GoogleErrorResponse,
  GoogleGenerateContentResponse,
} from './types';

export const GoogleChatCompleteConfig: ProviderConfig = {
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
        let lastRole: 'user' | 'model' | undefined;
        const messages: { role: string; parts: { text: string }[] }[] = [];

        params.messages?.forEach((message: Message) => {
          if (message.role === 'system') return;

          const role = message.role === 'assistant' ? 'model' : 'user';

          let parts = [];
          if (typeof message.content === 'string') {
            parts.push({
              text: message.content,
            });
          }

          if (message.content && typeof message.content === 'object') {
            message.content.forEach((c: ContentType) => {
              if (c.type === 'text') {
                parts.push({
                  text: c.text,
                });
              }
              if (c.type === 'image_url') {
                const { url } = c.image_url || {};

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
                  });

                  return;
                }

                // This part is problematic because URLs are not supported in the current implementation.
                // Two problems exist:
                // 1. Only Google Cloud Storage URLs are supported.
                // 2. MimeType is not supported in OpenAI API, but it is required in Google Vertex AI API.
                // Google will return an error here if any other URL is provided.
                parts.push({
                  fileData: {
                    mimeType: 'image/jpeg',
                    fileUri: url,
                  },
                });
              }
            });
          }

          // @NOTE: This takes care of the "Please ensure that multiturn requests alternate between user and model."
          // error that occurs when we have multiple user messages in a row.
          const shouldAppendEmptyModeChat =
            lastRole === 'user' &&
            role === 'user' &&
            !params.model?.includes('vision');

          if (shouldAppendEmptyModeChat) {
            messages.push({ role: 'model', parts: [{ text: '' }] });
          }

          messages.push({ role, parts });
          lastRole = role;
        });

        return messages;
      },
    },
    {
      param: 'systemInstruction',
      default: '',
      transform: (params: Params) => {
        const firstMessage = params.messages?.[0] || null;
        if (!firstMessage) return;

        if (
          firstMessage.role === 'system' &&
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
          firstMessage.role === 'system' &&
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
  stop: {
    param: 'generationConfig',
    transform: (params: Params) => transformGenerationConfig(params),
  },
  response_format: {
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
      params.tools?.forEach((tool) => {
        if (tool.type === 'function') {
          functionDeclarations.push(tool.function);
        }
      });
      return [{ functionDeclarations }];
    },
  },
};

export const GoogleChatCompleteResponseTransform: (
  response:
    | GoogleGenerateContentResponse
    | GoogleErrorResponse
    | GoogleErrorResponse[],
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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

  if (
    'candidates' in response &&
    response.candidates[0].finishReason === 'PROHIBITED_CONTENT'
  ) {
    return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
  }

  if ('candidates' in response) {
    const {
      promptTokenCount = 0,
      candidatesTokenCount = 0,
      totalTokenCount = 0,
    } = response.usageMetadata;

    return {
      id: crypto.randomUUID(),
      object: 'chat_completion',
      created: Math.floor(Date.now() / 1000),
      model: 'Unknown',
      provider: GOOGLE_VERTEX_AI,
      choices:
        response.candidates?.map((generation, index) => {
          let message: Message = { role: 'assistant', content: '' };
          if (generation.content.parts[0]?.text) {
            message = {
              role: 'assistant',
              content: generation.content.parts[0]?.text,
            };
          } else if (generation.content.parts[0]?.functionCall) {
            message = {
              role: 'assistant',
              tool_calls: [
                {
                  id: crypto.randomUUID(),
                  type: 'function',
                  function: {
                    name: generation.content.parts[0]?.functionCall.name,
                    arguments: JSON.stringify(
                      generation.content.parts[0]?.functionCall.args
                    ),
                  },
                },
              ],
            };
          }
          return {
            message: message,
            index: index,
            finish_reason: generation.finishReason,
          };
        }) ?? [],
      usage: {
        prompt_tokens: promptTokenCount,
        completion_tokens: candidatesTokenCount,
        total_tokens: totalTokenCount,
      },
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_VERTEX_AI);
};

export const GoogleChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  const chunk = responseChunk
    .trim()
    .replace(/^data: /, '')
    .trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  let parsedChunk: GoogleGenerateContentResponse = JSON.parse(chunk);

  let usageMetadata;
  if (parsedChunk.usageMetadata) {
    usageMetadata = {
      prompt_tokens: parsedChunk.usageMetadata.promptTokenCount,
      completion_tokens: parsedChunk.usageMetadata.candidatesTokenCount,
      total_tokens: parsedChunk.usageMetadata.totalTokenCount,
    };
  }

  const dataChunk = {
    id: fallbackId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: '',
    provider: GOOGLE_VERTEX_AI,
    choices:
      parsedChunk.candidates?.map((generation, index) => {
        let message: Message = { role: 'assistant', content: '' };
        if (generation.content.parts[0]?.text) {
          message = {
            role: 'assistant',
            content: generation.content.parts[0]?.text,
          };
        } else if (generation.content.parts[0]?.functionCall) {
          message = {
            role: 'assistant',
            tool_calls: [
              {
                id: crypto.randomUUID(),
                type: 'function',
                index: 0,
                function: {
                  name: generation.content.parts[0]?.functionCall.name,
                  arguments: JSON.stringify(
                    generation.content.parts[0]?.functionCall.args
                  ),
                },
              },
            ],
          };
        }
        return {
          delta: message,
          index: index,
          finish_reason: generation.finishReason,
        };
      }) ?? [],
    usage: usageMetadata,
  };

  return `data: ${JSON.stringify(dataChunk)}\n\n`;
};
