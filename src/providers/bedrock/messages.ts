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
import { ContentBlock, MessagesResponse } from '../../types/messagesResponse';
import {
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
} from '../../types/MessagesStreamResponse';
import { Params } from '../../types/requestBody';
import {
  ANTHROPIC_CONTENT_BLOCK_START_EVENT,
  ANTHROPIC_CONTENT_BLOCK_STOP_EVENT,
  ANTHROPIC_MESSAGE_DELTA_EVENT,
  ANTHROPIC_MESSAGE_START_EVENT,
  ANTHROPIC_MESSAGE_STOP_EVENT,
} from '../anthropic-base/constants';
import {
  AnthropicMessageDeltaEvent,
  AnthropicMessageStartEvent,
} from '../anthropic-base/types';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateInvalidProviderResponseError,
  transformToAnthropicStopReason,
} from '../utils';
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
  transformAnthropicAdditionalModelRequestFields,
  transformInferenceConfig,
  transformToolsConfig as transformToolConfig,
} from './utils/messagesUtils';

const appendTextBlock = (
  transformedContent: any[],
  textBlock: TextBlockParam
) => {
  transformedContent.push({
    text: textBlock.text,
  });
  if (textBlock.cache_control) {
    transformedContent.push({
      cachePoint: {
        type: 'default',
      },
    });
  }
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
    });
    if (imageBlock.cache_control) {
      transformedContent.push({
        cachePoint: {
          type: 'default',
        },
      });
    }
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
    });
    if (imageBlock.cache_control) {
      transformedContent.push({
        cachePoint: {
          type: 'default',
        },
      });
    }
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
    });
    if (documentBlock.cache_control) {
      transformedContent.push({
        cachePoint: {
          type: 'default',
        },
      });
    }
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
    });
    if (documentBlock.cache_control) {
      transformedContent.push({
        cachePoint: {
          type: 'default',
        },
      });
    }
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
  transformedContent.push({
    toolUse: {
      input: toolUseBlock.input,
      name: toolUseBlock.name,
      toolUseId: toolUseBlock.id,
    },
  });
  if (toolUseBlock.cache_control) {
    transformedContent.push({
      cachePoint: {
        type: 'default',
      },
    });
  }
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
        appendImageBlock(transformedToolResultContent, item);
      }
    }
  }
  transformedContent.push({
    toolResult: {
      toolUseId: toolResultBlock.tool_use_id,
      status: toolResultBlock.is_error ? 'error' : 'success',
      content: transformedToolResultContent,
    },
  });
  if (toolResultBlock.cache_control) {
    transformedContent.push({
      cachePoint: {
        type: 'default',
      },
    });
  }
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
              appendTextBlock(transformedContent, content);
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
        const transformedSystem: any[] = [];
        system.forEach((item) => {
          transformedSystem.push({
            text: item.text,
          });
          if (item.cache_control) {
            transformedSystem.push({
              cachePoint: {
                type: 'default',
              },
            });
          }
        });
        return transformedSystem;
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
  top_p: {
    param: 'inferenceConfig',
    required: false,
    transform: (params: BedrockMessagesParams) => {
      return transformInferenceConfig(params);
    },
  },
  performance_config: {
    param: 'performanceConfig',
    required: false,
  },
};

export const AnthropicBedrockConverseMessagesConfig: ProviderConfig = {
  ...BedrockConverseMessagesConfig,
  additional_model_request_fields: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  top_k: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  anthropic_version: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  user: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  thinking: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
  },
  anthropic_beta: {
    param: 'additionalModelRequestFields',
    transform: (params: BedrockMessagesParams) =>
      transformAnthropicAdditionalModelRequestFields(params),
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
  if (responseStatus !== 200) {
    return (
      BedrockErrorResponseTransform(response as BedrockErrorResponse) ||
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
      stop_reason: transformToAnthropicStopReason(response.stopReason),
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

function createContentBlockStartEvent(
  parsedChunk: BedrockChatCompleteStreamChunk
): RawContentBlockStartEvent {
  const contentBlockStartEvent: RawContentBlockStartEvent = JSON.parse(
    ANTHROPIC_CONTENT_BLOCK_START_EVENT
  );

  if (parsedChunk.start?.toolUse && parsedChunk.start.toolUse.toolUseId) {
    contentBlockStartEvent.content_block = {
      type: 'tool_use',
      id: parsedChunk.start.toolUse.toolUseId,
      name: parsedChunk.start.toolUse.name,
      input: {},
    };
  } else if (parsedChunk.delta?.reasoningContent?.text) {
    contentBlockStartEvent.content_block = {
      type: 'thinking',
      thinking: '',
      signature: '',
    };
  } else if (parsedChunk.delta?.reasoningContent?.redactedContent) {
    contentBlockStartEvent.content_block = {
      type: 'redacted_thinking',
      data: parsedChunk.delta.reasoningContent.redactedContent,
    };
  }

  return contentBlockStartEvent;
}

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
      const previousBlockStopEvent: RawContentBlockStopEvent = JSON.parse(
        ANTHROPIC_CONTENT_BLOCK_STOP_EVENT
      );
      previousBlockStopEvent.index = parsedChunk.contentBlockIndex - 1;
      returnChunk += `event: content_block_stop\ndata: ${JSON.stringify(previousBlockStopEvent)}\n\n`;
    }
    streamState.currentContentBlockIndex = parsedChunk.contentBlockIndex;
    const contentBlockStartEvent: RawContentBlockStartEvent =
      createContentBlockStartEvent(parsedChunk);
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
    const messageDeltaEvent: AnthropicMessageDeltaEvent = JSON.parse(
      ANTHROPIC_MESSAGE_DELTA_EVENT
    );
    messageDeltaEvent.usage.input_tokens = parsedChunk.usage.inputTokens;
    messageDeltaEvent.usage.output_tokens = parsedChunk.usage.outputTokens;
    messageDeltaEvent.usage.cache_read_input_tokens =
      parsedChunk.usage.cacheReadInputTokens;
    messageDeltaEvent.usage.cache_creation_input_tokens =
      parsedChunk.usage.cacheWriteInputTokens;
    messageDeltaEvent.delta.stop_reason = transformToAnthropicStopReason(
      streamState.stopReason
    );
    const contentBlockStopEvent: RawContentBlockStopEvent = JSON.parse(
      ANTHROPIC_CONTENT_BLOCK_STOP_EVENT
    );
    contentBlockStopEvent.index = streamState.currentContentBlockIndex;
    let returnChunk = `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStopEvent)}\n\n`;
    returnChunk += `event: message_delta\ndata: ${JSON.stringify(messageDeltaEvent)}\n\n`;
    returnChunk += `event: message_stop\ndata: ${JSON.stringify(ANTHROPIC_MESSAGE_STOP_EVENT)}\n\n`;
    return returnChunk;
  }
};

function getMessageStartEvent(fallbackId: string, gatewayRequest: Params) {
  const messageStartEvent: AnthropicMessageStartEvent = JSON.parse(
    ANTHROPIC_MESSAGE_START_EVENT
  );
  messageStartEvent.message.id = fallbackId;
  messageStartEvent.message.model = gatewayRequest.model as string;
  return `event: message_start\ndata: ${JSON.stringify(messageStartEvent)}\n\n`;
}
