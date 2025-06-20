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
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import { BedrockMessagesParams } from './types';
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

export const BedrockMessagesResponseTransform = (
  response: MessagesResponse | BedrockErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return (
      BedrockErrorResponseTransform(response) ||
      generateInvalidProviderResponseError(response, BEDROCK)
    );
  }

  if ('model' in response) return response;

  return generateInvalidProviderResponseError(response, BEDROCK);
};
