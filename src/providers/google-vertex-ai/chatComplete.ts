import { GOOGLE_VERTEX_AI } from '../../globals';
import { ContentType, Message, Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';

const transformGenerationConfig = (params: Params) => {
  const generationConfig: Record<string, any> = {};
  if (params['temperature']) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['top_k']) {
    generationConfig['topK'] = params['top_k'];
  }
  if (params['max_tokens']) {
    generationConfig['maxOutputTokens'] = params['max_tokens'];
  }
  if (params['stop']) {
    generationConfig['stopSequences'] = params['stop'];
  }
  return generationConfig;
};

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

// Docs for REST API
// https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/send-multimodal-prompts#gemini-send-multimodal-samples-drest

export const GoogleChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'gemini-pro-latest',
  },
  messages: {
    param: 'contents',
    default: '',
    transform: (params: Params) => {
      let lastRole: 'user' | 'model' | undefined;
      const messages: { role: string; parts: { text: string }[] }[] = [];

      params.messages?.forEach((message: Message) => {
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
              const { url } = c.image_url;

              if (!url) {
                // Shouldn't throw error?
                return;
              }

              // Example: data:image/png;base64,abcdefg...
              if (url.startsWith('data:')) {
                const [mimeTypeWithPrefix, base64Image] = url.split(';base64,');
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

export interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    status: string;
    details: Array<Record<string, any>>;
  };
}

interface GoogleGenerateFunctionCall {
  name: string;
  args: Record<string, any>;
}

interface GoogleGenerateContentResponse {
  candidates: {
    content: {
      parts: {
        text?: string;
        functionCall?: GoogleGenerateFunctionCall;
      }[];
    };
    finishReason: string;
    index: 0;
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  }[];
  promptFeedback: {
    safetyRatings: {
      category: string;
      probability: string;
      probabilityScore: number;
      severity: string;
      severityScore: number;
    }[];
  };
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

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
    return {
      error: {
        message: error.message,
        type: error.status,
        param: null,
        code: String(error.code),
      },
      provider: GOOGLE_VERTEX_AI,
    } as ErrorResponse;
  }

  if (responseStatus !== 200 && 'error' in response) {
    return {
      error: {
        message: response.error.message ?? '',
        type: response.error.status ?? null,
        param: null,
        code: String(response.error.code),
      },
      provider: GOOGLE_VERTEX_AI,
    } as ErrorResponse;
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

  return {
    error: {
      message: `Invalid response recieved from google: ${JSON.stringify(
        response
      )}`,
      type: null,
      param: null,
      code: null,
    },
    provider: GOOGLE_VERTEX_AI,
  } as ErrorResponse;
};

export const GoogleChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  if (chunk.startsWith('[')) {
    chunk = chunk.slice(1);
  }

  if (chunk.endsWith(',')) {
    chunk = chunk.slice(0, chunk.length - 1);
  }
  if (chunk.endsWith(']')) {
    chunk = chunk.slice(0, chunk.length - 2);
  }
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: GoogleGenerateContentResponse = JSON.parse(chunk);

  return (
    `data: ${JSON.stringify({
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
            index: generation.index,
            finish_reason: generation.finishReason,
          };
        }) ?? [],
    })}` + '\n\n'
  );
};