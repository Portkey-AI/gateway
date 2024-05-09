import { ANTHROPIC } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

// TODO: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const AnthropicChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    default: 'claude-2.1',
    required: true,
  },
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: Params) => {
        let messages: Message[] = [];
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach((msg) => {
            if (msg.role !== 'system') {
              if (
                msg.content &&
                typeof msg.content === 'object' &&
                msg.content.length
              ) {
                const transformedMessage: Record<string, any> = {
                  role: msg.role,
                  content: [],
                };
                msg.content.forEach((item) => {
                  if (item.type === 'text') {
                    transformedMessage.content.push({
                      type: item.type,
                      text: item.text,
                    });
                  } else if (
                    item.type === 'image_url' &&
                    item.image_url &&
                    item.image_url.url
                  ) {
                    const parts = item.image_url.url.split(';');
                    if (parts.length === 2) {
                      const base64ImageParts = parts[1].split(',');
                      const base64Image = base64ImageParts[1];
                      const mediaTypeParts = parts[0].split(':');
                      if (mediaTypeParts.length === 2 && base64Image) {
                        const mediaType = mediaTypeParts[1];
                        transformedMessage.content.push({
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Image,
                          },
                        });
                      }
                    }
                  }
                });
                messages.push(transformedMessage as Message);
              } else {
                messages.push({
                  role: msg.role,
                  content: msg.content,
                });
              }
            }
          });
        }

        return messages;
      },
    },
    {
      param: 'system',
      required: false,
      transform: (params: Params) => {
        let systemMessage: string = '';
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach((msg) => {
            if (
              msg.role === 'system' &&
              msg.content &&
              typeof msg.content === 'object' &&
              msg.content[0].text
            ) {
              systemMessage = msg.content[0].text;
            } else if (
              msg.role === 'system' &&
              typeof msg.content === 'string'
            ) {
              systemMessage = msg.content;
            }
          });
        }
        return systemMessage;
      },
    },
  ],
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: -1,
    min: -1,
  },
  top_k: {
    param: 'top_k',
    default: -1,
  },
  stop: {
    param: 'stop_sequences',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  user: {
    param: 'metadata.user_id',
  },
};

interface AnthropicErrorObject {
  type: string;
  message: string;
}

export interface AnthropicErrorResponse {
  type: string;
  error: AnthropicErrorObject;
}

interface AnthropicChatCompleteResponse {
  id: string;
  type: string;
  role: string;
  content: {
    type: string;
    text: string;
  }[];
  stop_reason: string;
  model: string;
  stop_sequence: null | string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicChatCompleteStreamResponse {
  type: string;
  index: number;
  delta: {
    type: string;
    text: string;
    stop_reason?: string;
  };
  usage?: {
    output_tokens?: number;
    input_tokens?: number;
  };
  message?: {
    usage?: {
      output_tokens?: number;
      input_tokens?: number;
    };
  };
}

export const AnthropicErrorResponseTransform: (
  response: AnthropicErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error?.message,
        type: response.error?.type,
        param: null,
        code: null,
      },
      ANTHROPIC
    );
  }

  return undefined;
};

// TODO: The token calculation is wrong atm
export const AnthropicChatCompleteResponseTransform: (
  response: AnthropicChatCompleteResponse | AnthropicErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = AnthropicErrorResponseTransform(
      response as AnthropicErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('content' in response) {
    const { input_tokens = 0, output_tokens = 0 } = response?.usage;

    return {
      id: response.id,
      object: 'chat_completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      provider: ANTHROPIC,
      choices: [
        {
          message: { role: 'assistant', content: response.content[0].text },
          index: 0,
          logprobs: null,
          finish_reason: response.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: input_tokens,
        completion_tokens: output_tokens,
        total_tokens: input_tokens + output_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, ANTHROPIC);
};

export const AnthropicChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string | undefined = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  if (
    chunk.startsWith('event: ping') ||
    chunk.startsWith('event: content_block_start') ||
    chunk.startsWith('event: content_block_stop')
  ) {
    return;
  }

  if (chunk.startsWith('event: message_stop')) {
    return 'data: [DONE]\n\n';
  }

  chunk = chunk.replace(/^event: content_block_delta[\r\n]*/, '');
  chunk = chunk.replace(/^event: message_delta[\r\n]*/, '');
  chunk = chunk.replace(/^event: message_start[\r\n]*/, '');
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  const parsedChunk: AnthropicChatCompleteStreamResponse = JSON.parse(chunk);

  if (parsedChunk.type === 'message_start' && parsedChunk.message?.usage) {
    return (
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: ANTHROPIC,
        choices: [
          {
            delta: {
              content: '',
            },
            index: 0,
            logprobs: null,
            finish_reason: null,
          },
        ],
        usage: {
          prompt_tokens: parsedChunk.message?.usage?.input_tokens,
        },
      })}` + '\n\n'
    );
  }

  if (parsedChunk.type === 'message_delta' && parsedChunk.usage) {
    return (
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: ANTHROPIC,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: parsedChunk.delta?.stop_reason,
          },
        ],
        usage: {
          completion_tokens: parsedChunk.usage?.output_tokens,
        },
      })}` + '\n\n'
    );
  }

  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: ANTHROPIC,
      choices: [
        {
          delta: {
            content: parsedChunk.delta?.text,
          },
          index: 0,
          logprobs: null,
          finish_reason: parsedChunk.delta?.stop_reason ?? null,
        },
      ],
    })}` + '\n\n'
  );
};
