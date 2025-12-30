import { fileExtensionMimeTypeMap } from '../../globals';
import {
  Params,
  Message,
  ContentType,
  SYSTEM_MESSAGE_ROLES,
  PromptCache,
  ToolChoiceObject,
} from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  AnthropicErrorObject,
  AnthropicErrorResponse,
  AnthropicStreamState,
  ANTHROPIC_STOP_REASON,
} from './types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';
import { AnthropicErrorResponseTransform } from './utils';

// TODO: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

interface AnthropicTool extends PromptCache {
  name: string;
  description?: string;
  input_schema?: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
    $defs: Record<string, any>;
  };
  type?: string;
  display_width_px?: number;
  display_height_px?: number;
  display_number?: number;
  /**
   * When true, this tool is not loaded into context initially.
   * Claude discovers it via Tool Search Tool on-demand.
   */
  defer_loading?: boolean;
  /**
   * List of tool types that can call this tool programmatically.
   * E.g., ["code_execution_20250825"] enables Programmatic Tool Calling.
   */
  allowed_callers?: string[];
  /**
   * Example inputs demonstrating how to use this tool.
   */
  input_examples?: Record<string, any>[];
}

interface AnthropicToolResultContentItem {
  type: 'tool_result';
  tool_use_id: string;
  content?:
    | {
        type: string;
        text?: string;
        cache_control?: {
          type: string;
          ttl?: number;
        };
      }[]
    | string;
}

interface AnthropicBase64ImageContentItem {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface AnthropicUrlImageContentItem {
  type: 'image';
  source: {
    type: 'url';
    url: string;
  };
}

interface AnthropicTextContentItem {
  type: 'text';
  text: string;
}

interface AnthropicUrlPdfContentItem {
  type: string;
  source: {
    type: string;
    url: string;
  };
}

interface AnthropicBase64PdfContentItem {
  type: string;
  source: {
    type: string;
    data: string;
    media_type: string;
  };
}

interface AnthropicPlainTextContentItem {
  type: string;
  source: {
    type: string;
    data: string;
    media_type: string;
  };
}

type AnthropicMessageContentItem =
  | AnthropicToolResultContentItem
  | AnthropicBase64ImageContentItem
  | AnthropicUrlImageContentItem
  | AnthropicTextContentItem
  | AnthropicUrlPdfContentItem
  | AnthropicBase64PdfContentItem
  | AnthropicPlainTextContentItem;

interface AnthropicMessage extends Message, PromptCache {
  content: AnthropicMessageContentItem[];
}

const transformAssistantMessage = (msg: Message): AnthropicMessage => {
  let transformedContent: AnthropicContentItem[] = [];
  let inputContent: ContentType[] | string | undefined =
    msg.content_blocks ?? msg.content;
  const containsToolCalls = msg.tool_calls && msg.tool_calls.length;

  if (inputContent && typeof inputContent === 'string') {
    transformedContent.push({
      type: 'text',
      text: inputContent,
    });
  } else if (
    inputContent &&
    typeof inputContent === 'object' &&
    inputContent.length
  ) {
    inputContent.forEach((item) => {
      if (item.type !== 'tool_use') {
        transformedContent.push(item as AnthropicContentItem);
      }
    });
  }
  if (containsToolCalls) {
    msg.tool_calls.forEach((toolCall: any) => {
      transformedContent.push({
        type: 'tool_use',
        name: toolCall.function.name,
        id: toolCall.id,
        input: toolCall.function.arguments?.length
          ? JSON.parse(toolCall.function.arguments)
          : {},
        ...(toolCall.cache_control && {
          cache_control: toolCall.cache_control,
        }),
      });
    });
  }
  return {
    role: msg.role,
    content: transformedContent as AnthropicMessageContentItem[],
  };
};

const transformToolMessage = (msg: Message): AnthropicMessage => {
  const tool_use_id = msg.tool_call_id ?? '';
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id,
        content: msg.content,
      },
    ],
  };
};

const transformAndAppendImageContentItem = (
  item: ContentType,
  transformedMessage: AnthropicMessage
) => {
  if (!item?.image_url?.url || typeof transformedMessage.content === 'string')
    return;
  const url = item.image_url.url;
  const isBase64EncodedImage = url.startsWith('data:');
  if (!isBase64EncodedImage) {
    transformedMessage.content.push({
      type: 'image',
      source: {
        type: 'url',
        url,
      },
    });
  } else {
    const parts = url.split(';');
    if (parts.length === 2) {
      const base64ImageParts = parts[1].split(',');
      const base64Image = base64ImageParts[1];
      const mediaTypeParts = parts[0].split(':');
      if (mediaTypeParts.length === 2 && base64Image) {
        const mediaType = mediaTypeParts[1];
        transformedMessage.content.push({
          type:
            mediaType === fileExtensionMimeTypeMap.pdf ? 'document' : 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Image,
          },
          ...((item as any).cache_control && {
            cache_control: { type: 'ephemeral' },
          }),
        });
      }
    }
  }
};

const transformAndAppendFileContentItem = (
  item: ContentType,
  transformedMessage: AnthropicMessage
) => {
  const mimeType =
    (item.file?.mime_type as keyof typeof fileExtensionMimeTypeMap) ||
    fileExtensionMimeTypeMap.pdf;
  if (item.file?.file_url) {
    transformedMessage.content.push({
      type: 'document',
      source: {
        type: 'url',
        url: item.file.file_url,
      },
    });
  } else if (item.file?.file_data) {
    const contentType =
      mimeType === fileExtensionMimeTypeMap.txt ? 'text' : 'base64';
    transformedMessage.content.push({
      type: 'document',
      source: {
        type: contentType,
        data: item.file.file_data,
        media_type: mimeType,
      },
    });
  }
};

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
        let messages: AnthropicMessage[] = [];
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach((msg: Message & PromptCache) => {
            if (SYSTEM_MESSAGE_ROLES.includes(msg.role)) return;

            if (msg.role === 'assistant') {
              messages.push(transformAssistantMessage(msg));
            } else if (msg.role === 'tool') {
              // even though anthropic supports images in tool results, openai doesn't support it yet
              messages.push(transformToolMessage(msg));
            } else if (
              msg.content &&
              typeof msg.content === 'object' &&
              msg.content.length
            ) {
              const transformedMessage: AnthropicMessage = {
                role: msg.role,
                content: [],
              };
              msg.content.forEach((item) => {
                if (item.type === 'text') {
                  transformedMessage.content.push({
                    type: item.type,
                    text: item.text,
                    ...((item as any).cache_control && {
                      cache_control: { type: 'ephemeral' },
                    }),
                  });
                } else if (item.type === 'image_url') {
                  transformAndAppendImageContentItem(item, transformedMessage);
                } else if (item.type === 'file') {
                  transformAndAppendFileContentItem(item, transformedMessage);
                }
              });
              messages.push(transformedMessage as AnthropicMessage);
            } else {
              messages.push({
                role: msg.role,
                content: msg.content as AnthropicMessageContentItem[],
              });
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
        let systemMessages: AnthropicMessageContentItem[] = [];
        // Transform the chat messages into a simple prompt
        if (!!params.messages) {
          params.messages.forEach((msg: Message & PromptCache) => {
            if (
              SYSTEM_MESSAGE_ROLES.includes(msg.role) &&
              msg.content &&
              typeof msg.content === 'object' &&
              msg.content[0].text
            ) {
              msg.content.forEach((_msg) => {
                systemMessages.push({
                  text: _msg.text,
                  type: 'text',
                  ...((_msg as any)?.cache_control && {
                    cache_control: { type: 'ephemeral' },
                  }),
                });
              });
            } else if (
              SYSTEM_MESSAGE_ROLES.includes(msg.role) &&
              typeof msg.content === 'string'
            ) {
              systemMessages.push({
                ...(msg?.cache_control && {
                  cache_control: { type: 'ephemeral' },
                }),
                text: msg.content,
                type: 'text',
              });
            }
          });
        }
        return systemMessages;
      },
    },
  ],
  tools: {
    param: 'tools',
    required: false,
    transform: (params: Params) => {
      let tools: AnthropicTool[] = [];
      if (params.tools) {
        params.tools.forEach((tool) => {
          if (tool.function) {
            tools.push({
              name: tool.function.name,
              description: tool.function?.description || '',
              input_schema: {
                type: tool.function.parameters?.type || 'object',
                properties: tool.function.parameters?.properties || {},
                required: tool.function.parameters?.required || [],
                $defs: tool.function.parameters?.['$defs'] || {},
              },
              ...(tool.cache_control && {
                cache_control: { type: 'ephemeral' },
              }),
              // Advanced tool use properties (nested in function object per OpenAI format)
              ...(tool.function.defer_loading !== undefined && {
                defer_loading: tool.function.defer_loading,
              }),
              ...(tool.function.allowed_callers && {
                allowed_callers: tool.function.allowed_callers,
              }),
              ...(tool.function.input_examples && {
                input_examples: tool.function.input_examples,
              }),
            });
          } else if (tool.type) {
            // Handle special tool types (tool search tools, code_execution, mcp_toolset, etc.)
            const toolOptions = tool[tool.type];
            tools.push({
              ...(toolOptions && { ...toolOptions }),
              name: tool.type,
              type: toolOptions?.name,
              ...(tool.cache_control && {
                cache_control: { type: 'ephemeral' },
              }),
            });
          }
        });
      }
      return tools;
    },
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
    transform: (params: Params) => {
      if (params.tool_choice) {
        if (typeof params.tool_choice === 'string') {
          if (params.tool_choice === 'required') return { type: 'any' };
          else if (params.tool_choice === 'auto') return { type: 'auto' };
          else if (params.tool_choice === 'none') return { type: 'none' };
        } else if (typeof params.tool_choice === 'object') {
          return {
            type: 'tool',
            name: (params.tool_choice as ToolChoiceObject).function.name,
          };
        }
      }
      return null;
    },
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  max_completion_tokens: {
    param: 'max_tokens',
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
  // anthropic specific fields
  user: {
    param: 'metadata.user_id',
  },
  thinking: {
    param: 'thinking',
    required: false,
  },
};

interface AnthorpicTextContentItem {
  type: 'text';
  text: string;
}

interface AnthropicToolContentItem {
  type: 'tool_use';
  name: string;
  id: string;
  input: Record<string, any>;
}

type AnthropicContentItem = AnthorpicTextContentItem | AnthropicToolContentItem;

export interface AnthropicChatCompleteResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentItem[];
  stop_reason: ANTHROPIC_STOP_REASON;
  model: string;
  stop_sequence: null | string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AnthropicChatCompleteStreamResponse {
  type: string;
  index: number;
  delta: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: ANTHROPIC_STOP_REASON;
  };
  content_block?: {
    type: string;
    id?: string;
    text?: string;
    name?: string;
    input?: {};
  };
  usage?: {
    output_tokens?: number;
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  message?: {
    usage?: {
      output_tokens?: number;
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;
  };
  error?: AnthropicErrorObject;
}

export const getAnthropicChatCompleteResponseTransform = (provider: string) => {
  const AnthropicChatCompleteResponseTransform: (
    response: AnthropicChatCompleteResponse | AnthropicErrorResponse,
    responseStatus: number,
    responseHeaders: Headers,
    strictOpenAiCompliance: boolean
  ) => ChatCompletionResponse | ErrorResponse = (
    response,
    responseStatus,
    _responseHeaders,
    strictOpenAiCompliance
  ) => {
    if (responseStatus !== 200 && 'error' in response) {
      return AnthropicErrorResponseTransform(response, provider);
    }

    if ('content' in response) {
      const {
        input_tokens = 0,
        output_tokens = 0,
        cache_creation_input_tokens,
        cache_read_input_tokens,
      } = response?.usage;

      const shouldSendCacheUsage =
        cache_creation_input_tokens || cache_read_input_tokens;

      let content: string = '';
      response.content.forEach((item) => {
        if (item.type === 'text') {
          content += item.text;
        }
      });

      let toolCalls: any = [];
      response.content.forEach((item) => {
        if (item.type === 'tool_use') {
          toolCalls.push({
            id: item.id,
            type: 'function',
            function: {
              name: item.name,
              arguments: JSON.stringify(item.input),
            },
          });
        }
      });

      return {
        id: response.id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        provider: provider,
        choices: [
          {
            message: {
              role: 'assistant',
              content,
              ...(!strictOpenAiCompliance && {
                content_blocks: response.content.filter(
                  (item) => item.type !== 'tool_use'
                ),
              }),
              tool_calls: toolCalls.length ? toolCalls : undefined,
            },
            index: 0,
            logprobs: null,
            finish_reason: transformFinishReason(
              response.stop_reason,
              strictOpenAiCompliance
            ),
          },
        ],
        usage: {
          prompt_tokens: input_tokens,
          completion_tokens: output_tokens,
          total_tokens:
            input_tokens +
            output_tokens +
            (cache_creation_input_tokens ?? 0) +
            (cache_read_input_tokens ?? 0),
          prompt_tokens_details: {
            cached_tokens: cache_read_input_tokens ?? 0,
          },
          ...(shouldSendCacheUsage && {
            cache_read_input_tokens: cache_read_input_tokens,
            cache_creation_input_tokens: cache_creation_input_tokens,
          }),
        },
      };
    }

    return generateInvalidProviderResponseError(response, provider);
  };
  return AnthropicChatCompleteResponseTransform;
};

export const getAnthropicStreamChunkTransform = (provider: string) => {
  const AnthropicChatCompleteStreamChunkTransform: (
    response: string,
    fallbackId: string,
    streamState: AnthropicStreamState,
    _strictOpenAiCompliance: boolean
  ) => string | undefined = (
    responseChunk,
    fallbackId,
    streamState,
    strictOpenAiCompliance
  ) => {
    if (streamState.toolIndex == undefined) {
      streamState.toolIndex = -1;
    }
    let chunk = responseChunk.trim();
    if (
      chunk.startsWith('event: ping') ||
      chunk.startsWith('event: content_block_stop')
    ) {
      return;
    }

    if (chunk.startsWith('event: message_stop')) {
      return 'data: [DONE]\n\n';
    }

    chunk = chunk.replace(/^event: content_block_delta[\r\n]*/, '');
    chunk = chunk.replace(/^event: content_block_start[\r\n]*/, '');
    chunk = chunk.replace(/^event: message_delta[\r\n]*/, '');
    chunk = chunk.replace(/^event: message_start[\r\n]*/, '');
    chunk = chunk.replace(/^event: error[\r\n]*/, '');
    chunk = chunk.replace(/^data: /, '');
    chunk = chunk.trim();

    const parsedChunk: AnthropicChatCompleteStreamResponse = JSON.parse(chunk);

    if (parsedChunk.type === 'error' && parsedChunk.error) {
      return (
        `data: ${JSON.stringify({
          id: fallbackId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: '',
          provider: provider,
          choices: [
            {
              finish_reason: parsedChunk.error.type,
              delta: {
                content: '',
              },
            },
          ],
        })}` +
        '\n\n' +
        'data: [DONE]\n\n'
      );
    }

    const shouldSendCacheUsage =
      parsedChunk.message?.usage?.cache_read_input_tokens ||
      parsedChunk.message?.usage?.cache_creation_input_tokens;

    if (parsedChunk.type === 'message_start' && parsedChunk.message?.usage) {
      streamState.model = parsedChunk?.message?.model ?? '';
      streamState.usage = {
        prompt_tokens: parsedChunk.message?.usage?.input_tokens,
        ...(shouldSendCacheUsage && {
          cache_read_input_tokens:
            parsedChunk.message?.usage?.cache_read_input_tokens,
          cache_creation_input_tokens:
            parsedChunk.message?.usage?.cache_creation_input_tokens,
        }),
      };
      return (
        `data: ${JSON.stringify({
          id: fallbackId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: streamState.model,
          provider: provider,
          choices: [
            {
              delta: {
                content: '',
                role: 'assistant',
              },
              index: 0,
              logprobs: null,
              finish_reason: null,
            },
          ],
        })}` + '\n\n'
      );
    }

    // final chunk
    if (parsedChunk.type === 'message_delta' && parsedChunk.usage) {
      const totalTokens =
        (streamState?.usage?.prompt_tokens ?? 0) +
        (streamState?.usage?.cache_creation_input_tokens ?? 0) +
        (streamState?.usage?.cache_read_input_tokens ?? 0) +
        (parsedChunk.usage.output_tokens ?? 0);
      return (
        `data: ${JSON.stringify({
          id: fallbackId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: streamState.model,
          provider: provider,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: transformFinishReason(
                parsedChunk.delta?.stop_reason,
                strictOpenAiCompliance
              ),
            },
          ],
          usage: {
            ...streamState.usage,
            completion_tokens: parsedChunk.usage?.output_tokens,
            total_tokens: totalTokens,
            prompt_tokens_details: {
              cached_tokens: streamState.usage?.cache_read_input_tokens ?? 0,
            },
          },
        })}` + '\n\n'
      );
    }

    const toolCalls = [];
    const isToolBlockStart: boolean =
      parsedChunk.type === 'content_block_start' &&
      parsedChunk.content_block?.type === 'tool_use';
    if (isToolBlockStart) {
      streamState.toolIndex = streamState.toolIndex + 1;
    }
    const isToolBlockDelta: boolean =
      parsedChunk.type === 'content_block_delta' &&
      parsedChunk.delta?.partial_json != undefined;

    if (isToolBlockStart && parsedChunk.content_block) {
      toolCalls.push({
        index: streamState.toolIndex,
        id: parsedChunk.content_block.id,
        type: 'function',
        function: {
          name: parsedChunk.content_block.name,
          arguments: '',
        },
      });
    } else if (isToolBlockDelta) {
      toolCalls.push({
        index: streamState.toolIndex,
        function: {
          arguments: parsedChunk.delta.partial_json,
        },
      });
    }

    const content = parsedChunk.delta?.text;

    const contentBlockObject = {
      index: parsedChunk.index,
      delta: parsedChunk.delta ?? parsedChunk.content_block ?? {},
    };
    delete contentBlockObject.delta.type;

    return (
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: streamState.model,
        provider: provider,
        choices: [
          {
            delta: {
              content,
              tool_calls: toolCalls.length ? toolCalls : undefined,
              ...(!strictOpenAiCompliance &&
                !toolCalls.length && {
                  content_blocks: [contentBlockObject],
                }),
            },
            index: 0,
            logprobs: null,
            finish_reason: null,
          },
        ],
      })}` + '\n\n'
    );
  };
  return AnthropicChatCompleteStreamChunkTransform;
};
