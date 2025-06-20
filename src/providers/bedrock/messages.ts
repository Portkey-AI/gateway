import { BEDROCK } from '../../globals';
import {
  DocumentBlockParam,
  ImageBlockParam,
  RedactedThinkingBlockParam,
  TextBlockParam,
  ThinkingBlockParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '../../types/MessagesRequest';
import {
  ContentBlock,
  MessagesResponse,
  STOP_REASON,
} from '../../types/messagesResponse';
import { RawContentBlockDeltaEvent } from '../../types/MessagesStreamResponse';
import {
  ANTHROPIC_CONTENT_BLOCK_START_EVENT,
  ANTHROPIC_CONTENT_BLOCK_STOP_EVENT,
  ANTHROPIC_MESSAGE_DELTA_EVENT,
  ANTHROPIC_MESSAGE_START_EVENT,
  ANTHROPIC_MESSAGE_STOP_EVENT,
} from '../anthropic-base/constants';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import {
  BedrockChatCompleteStreamChunk,
  BedrockChatCompletionResponse,
  BedrockContentItem,
  BedrockMessagesParams,
  BedrockStreamState,
} from './types';
import {
  transformInferenceConfig,
  transformToolsConfig as transformToolConfig,
} from './utils/messagesUtils';

const transformTextBlock = (textBlock: TextBlockParam) => {
  return {
    text: textBlock.text,
    ...(textBlock.cache_control && {
      cachePoint: {
        type: 'default',
      },
    }),
  };
};

const appendImageBlock = (
  transformedContent: any[],
  imageBlock: ImageBlockParam
) => {
  if (imageBlock.source.type === 'base64') {
    transformedContent.push({
      image: {
        format: imageBlock.source.media_type.split('/')[1],
        source: {
          bytes: imageBlock.source.data,
        },
      },
      ...(imageBlock.cache_control && {
        cachePoint: {
          type: 'default',
        },
      }),
    });
  } else if (imageBlock.source.type === 'url') {
    transformedContent.push({
      image: {
        format: imageBlock.source.media_type.split('/')[1],
        source: {
          s3Location: {
            uri: imageBlock.source.url,
          },
        },
      },
      ...(imageBlock.cache_control && {
        cachePoint: {
          type: 'default',
        },
      }),
    });
  } else if (imageBlock.source.type === 'file') {
    // not supported
  }
};

const appendDocumentBlock = (
  transformedContent: any[],
  documentBlock: DocumentBlockParam
) => {
  if (documentBlock.source.type === 'base64') {
    transformedContent.push({
      document: {
        format: documentBlock.source.media_type.split('/')[1],
        source: {
          bytes: documentBlock.source.data,
        },
      },
      ...(documentBlock.cache_control && {
        cachePoint: {
          type: 'default',
        },
      }),
    });
  } else if (documentBlock.source.type === 'url') {
    transformedContent.push({
      document: {
        format: documentBlock.source.media_type?.split('/')[1] || 'pdf',
        source: {
          s3Location: {
            uri: documentBlock.source.url,
          },
        },
      },
      ...(documentBlock.cache_control && {
        cachePoint: {
          type: 'default',
        },
      }),
    });
  }
};

const appendThinkingBlock = (
  transformedContent: any[],
  thinkingBlock: ThinkingBlockParam
) => {
  transformedContent.push({
    reasoningContent: {
      reasoningText: {
        text: thinkingBlock.thinking,
        signature: thinkingBlock.signature,
      },
    },
  });
};

const appendRedactedThinkingBlock = (
  transformedContent: any[],
  redactedThinkingBlock: RedactedThinkingBlockParam
) => {
  transformedContent.push({
    reasoningContent: {
      redactedContent: redactedThinkingBlock.data,
    },
  });
};

const appendToolUseBlock = (
  transformedContent: any[],
  toolUseBlock: ToolUseBlockParam
) => {
  return {
    toolUse: {
      input: toolUseBlock.input,
      name: toolUseBlock.name,
      toolUseId: toolUseBlock.id,
    },
    ...(toolUseBlock.cache_control && {
      cachePoint: {
        type: 'default',
      },
    }),
  };
};

const appendToolResultBlock = (
  transformedContent: any[],
  toolResultBlock: ToolResultBlockParam
) => {
  const content = toolResultBlock.content;
  const transformedToolResultContent: any[] = [];
  if (typeof content === 'string') {
    transformedToolResultContent.push({
      text: content,
    });
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text') {
        transformedToolResultContent.push({
          text: item.text,
        });
      } else if (item.type === 'image') {
        // TODO: test this
        appendImageBlock(transformedToolResultContent, item);
      }
    }
  }
  return {
    toolResult: {
      toolUseId: toolResultBlock.tool_use_id,
      status: toolResultBlock.is_error ? 'error' : 'success',
      content: transformedToolResultContent,
    },
    ...(toolResultBlock.cache_control && {
      cachePoint: {
        type: 'default',
      },
    }),
  };
};

export const BedrockConverseMessagesConfig: ProviderConfig = {
  max_tokens: {
    param: 'inferenceConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformInferenceConfig(params);
    },
  },
  messages: {
    param: 'messages',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      const transformedMessages: any[] = [];
      for (const message of params.messages) {
        if (typeof message.content === 'string') {
          transformedMessages.push({
            role: message.role,
            content: [
              {
                text: message.content,
              },
            ],
          });
        } else if (Array.isArray(message.content)) {
          const transformedContent: any[] = [];
          for (const content of message.content) {
            if (content.type === 'text') {
              transformedContent.push(transformTextBlock(content));
            } else if (content.type === 'image') {
              appendImageBlock(transformedContent, content);
            } else if (content.type === 'document') {
              appendDocumentBlock(transformedContent, content);
            } else if (content.type === 'thinking') {
              appendThinkingBlock(transformedContent, content);
            } else if (content.type === 'redacted_thinking') {
              appendRedactedThinkingBlock(transformedContent, content);
            } else if (content.type === 'tool_use') {
              appendToolUseBlock(transformedContent, content);
            } else if (content.type === 'tool_result') {
              appendToolResultBlock(transformedContent, content);
            }
            // not supported
            // else if (content.type === 'server_tool_use') {}
            // else if (content.type === 'web_search_tool_result') {}
            // else if (content.type === 'code_execution_tool_result') {}
            // else if (content.type === 'mcp_tool_use') {}
            // else if (content.type === 'mcp_tool_result') {}
            // else if (content.type === 'container_upload') {}
          }
          transformedMessages.push({
            role: message.role,
            content: transformedContent,
          });
        }
      }
      return transformedMessages;
    },
  },
  metadata: {
    param: 'requestMetadata',
    required: false,
  },
  stop_sequences: {
    param: 'inferenceConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformInferenceConfig(params);
    },
  },
  system: {
    param: 'system',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      const system = params.system;
      if (typeof system === 'string') {
        return [
          {
            text: system,
          },
        ];
      } else if (Array.isArray(system)) {
        return system.map((item) => ({
          text: item.text,
          ...(item.cache_control && {
            cachePoint: {
              type: 'default',
            },
          }),
        }));
      }
    },
  },
  temperature: {
    param: 'inferenceConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformInferenceConfig(params);
    },
  },
  // this if for anthropic
  // thinking: {
  //   param: 'thinking',
  //   required: false,
  // },
  tool_choice: {
    param: 'toolChoice',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformToolConfig(params);
    },
  },
  tools: {
    param: 'toolConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformToolConfig(params);
    },
  },
  // top_k: {
  //   param: 'top_k',
  //   required: false,
  // },
  top_p: {
    param: 'inferenceConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformInferenceConfig(params);
    },
  },
};

const transformContentBlocks = (
  contentBlocks: BedrockContentItem[]
): ContentBlock[] => {
  const transformedContent: ContentBlock[] = [];
  for (const contentBlock of contentBlocks) {
    if (contentBlock.text) {
      transformedContent.push({
        type: 'text',
        text: contentBlock.text,
      });
    } else if (contentBlock.reasoningContent?.reasoningText) {
      transformedContent.push({
        type: 'thinking',
        thinking: contentBlock.reasoningContent.reasoningText.text,
        signature: contentBlock.reasoningContent.reasoningText.signature,
      });
    } else if (contentBlock.reasoningContent?.redactedContent) {
      transformedContent.push({
        type: 'redacted_thinking',
        data: contentBlock.reasoningContent.redactedContent,
      });
    } else if (contentBlock.toolUse) {
      transformedContent.push({
        type: 'tool_use',
        id: contentBlock.toolUse.toolUseId,
        name: contentBlock.toolUse.name,
        input: contentBlock.toolUse.input,
      });
    }
  }
  return transformedContent;
};

export const BedrockMessagesResponseTransform = (
  response: BedrockChatCompletionResponse | BedrockErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  _strictOpenAiCompliance: boolean,
  _gatewayRequestUrl: string,
  gatewayRequest: Params
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return (
      BedrockErrorResponseTransform(response) ||
      generateInvalidProviderResponseError(response, BEDROCK)
    );
  }

  if ('output' in response) {
    const transformedContent = transformContentBlocks(
      response.output.message.content
    );
    const responseObj: MessagesResponse = {
      // TODO: shorten this
      id: 'portkey-' + crypto.randomUUID(),
      model: (gatewayRequest.model as string) || '',
      type: 'message',
      role: 'assistant',
      content: transformedContent,
      // TODO: pull changes from stop reason transformation PR
      stop_reason: response.stopReason as STOP_REASON,
      usage: {
        cache_read_input_tokens: response.usage.cacheReadInputTokens,
        cache_creation_input_tokens: response.usage.cacheWriteInputTokens,
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
      },
    };
    return responseObj;
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

const transformContentBlock = (
  contentBlock: BedrockChatCompleteStreamChunk
): RawContentBlockDeltaEvent | undefined => {
  if (!contentBlock.delta || contentBlock.contentBlockIndex === undefined) {
    return undefined;
  }
  if (contentBlock.delta.text) {
    return {
      type: 'content_block_delta',
      index: contentBlock.contentBlockIndex,
      delta: {
        type: 'text_delta',
        text: contentBlock.delta.text,
      },
    };
  } else if (contentBlock.delta.reasoningContent?.text) {
    return {
      type: 'content_block_delta',
      index: contentBlock.contentBlockIndex,
      delta: {
        type: 'thinking_delta',
        thinking: contentBlock.delta.reasoningContent.text,
      },
    };
  } else if (contentBlock.delta.reasoningContent?.signature) {
    return {
      type: 'content_block_delta',
      index: contentBlock.contentBlockIndex,
      delta: {
        type: 'signature_delta',
        signature: contentBlock.delta.reasoningContent.signature,
      },
    };
  } else if (contentBlock.delta.toolUse) {
    return {
      type: 'content_block_delta',
      index: contentBlock.contentBlockIndex,
      delta: {
        type: 'input_json_delta',
        partial_json: contentBlock.delta.toolUse.input,
      },
    };
  }
  return undefined;
};

export const BedrockConverseMessagesStreamChunkTransform = (
  responseChunk: string,
  fallbackId: string,
  streamState: BedrockStreamState,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => {
  const parsedChunk: BedrockChatCompleteStreamChunk = JSON.parse(responseChunk);
  if (streamState.currentContentBlockIndex === undefined) {
    streamState.currentContentBlockIndex = -1;
  }
  if (parsedChunk.stopReason) {
    streamState.stopReason = parsedChunk.stopReason;
  }
  // message start event
  if (parsedChunk.role) {
    return getMessageStartEvent(fallbackId, gatewayRequest);
  }
  // content block start and stop events
  if (
    parsedChunk.contentBlockIndex !== undefined &&
    parsedChunk.contentBlockIndex !== streamState.currentContentBlockIndex
  ) {
    let returnChunk = '';
    if (streamState.currentContentBlockIndex !== -1) {
      const previousBlockStopEvent = { ...ANTHROPIC_CONTENT_BLOCK_STOP_EVENT };
      previousBlockStopEvent.index = parsedChunk.contentBlockIndex - 1;
      returnChunk += `event: content_block_stop\ndata: ${JSON.stringify(previousBlockStopEvent)}\n\n`;
    }
    streamState.currentContentBlockIndex = parsedChunk.contentBlockIndex;
    const contentBlockStartEvent = { ...ANTHROPIC_CONTENT_BLOCK_START_EVENT };
    contentBlockStartEvent.index = parsedChunk.contentBlockIndex;
    returnChunk += `event: content_block_start\ndata: ${JSON.stringify(contentBlockStartEvent)}\n\n`;
    const contentBlockDeltaEvent = transformContentBlock(parsedChunk);
    if (contentBlockDeltaEvent) {
      returnChunk += `event: content_block_delta\ndata: ${JSON.stringify(contentBlockDeltaEvent)}\n\n`;
    }
    return returnChunk;
  }
  // content block delta event
  if (parsedChunk.delta) {
    const contentBlockDeltaEvent = transformContentBlock(parsedChunk);
    if (contentBlockDeltaEvent) {
      return `event: content_block_delta\ndata: ${JSON.stringify(contentBlockDeltaEvent)}\n\n`;
    }
  }
  // message delta and message stop events
  if (parsedChunk.usage) {
    const messageDeltaEvent = { ...ANTHROPIC_MESSAGE_DELTA_EVENT };
    messageDeltaEvent.usage.input_tokens = parsedChunk.usage.inputTokens;
    messageDeltaEvent.usage.output_tokens = parsedChunk.usage.outputTokens;
    messageDeltaEvent.usage.cache_read_input_tokens =
      parsedChunk.usage.cacheReadInputTokens;
    messageDeltaEvent.usage.cache_creation_input_tokens =
      parsedChunk.usage.cacheWriteInputTokens;
    messageDeltaEvent.delta.stop_reason = streamState.stopReason || '';
    const contentBlockStopEvent = { ...ANTHROPIC_CONTENT_BLOCK_STOP_EVENT };
    contentBlockStopEvent.index = streamState.currentContentBlockIndex;
    let returnChunk = `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStopEvent)}\n\n`;
    returnChunk += `event: message_delta\ndata: ${JSON.stringify(messageDeltaEvent)}\n\n`;
    returnChunk += `event: message_stop\ndata: ${JSON.stringify(ANTHROPIC_MESSAGE_STOP_EVENT)}\n\n`;
    return returnChunk;
  }
  // console.log(JSON.stringify(parsedChunk, null, 2));
};

function getMessageStartEvent(fallbackId: string, gatewayRequest: Params<any>) {
  const messageStartEvent = { ...ANTHROPIC_MESSAGE_START_EVENT };
  messageStartEvent.message.id = fallbackId;
  messageStartEvent.message.model = gatewayRequest.model as string;
  // bedrock does not send usage in the beginning of the stream
  delete messageStartEvent.message.usage;
  return `event: message_start\ndata: ${JSON.stringify(messageStartEvent)}\n\n`;
}
