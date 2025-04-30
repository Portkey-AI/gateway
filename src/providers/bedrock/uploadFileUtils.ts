import { BEDROCK } from '../../globals';
import {
  ContentType,
  Message,
  MESSAGE_ROLES,
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
  BedrockAI21CompleteResponse,
  BedrockCohereCompleteResponse,
  BedrockLlamaCompleteResponse,
  BedrockMistralCompleteResponse,
  BedrockTitanCompleteResponse,
} from './complete';
import {
  LLAMA_2_SPECIAL_TOKENS,
  LLAMA_3_SPECIAL_TOKENS,
  MISTRAL_CONTROL_TOKENS,
} from './constants';
import { BedrockErrorResponse } from './embed';
import * as z from 'zod';

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
  };
}

interface AnthropicToolResultContentItem {
  type: 'tool_result';
  tool_use_id: string;
  content?: string;
}

type AnthropicMessageContentItem = AnthropicToolResultContentItem | ContentType;

interface AnthropicMessage extends Message {
  content?: string | AnthropicMessageContentItem[];
}

interface AnthropicTextContentItem {
  type: 'text';
  text: string;
}

interface AnthropicToolContentItem {
  type: 'tool_use';
  name: string;
  id: string;
  input: Record<string, any>;
}

type AnthropicContentItem = AnthropicTextContentItem | AnthropicToolContentItem;

const transformAssistantMessageForAnthropic = (
  msg: Message
): AnthropicMessage => {
  const content: AnthropicContentItem[] = [];
  const containsToolCalls = msg.tool_calls && msg.tool_calls.length;

  if (msg.content && typeof msg.content === 'string') {
    content.push({
      type: 'text',
      text: msg.content,
    });
  } else if (
    msg.content &&
    typeof msg.content === 'object' &&
    msg.content.length
  ) {
    if (msg.content[0].text) {
      content.push({
        type: 'text',
        text: msg.content[0].text,
      });
    }
  }
  if (containsToolCalls) {
    msg.tool_calls.forEach((toolCall: any) => {
      content.push({
        type: 'tool_use',
        name: toolCall.function.name,
        id: toolCall.id,
        input: JSON.parse(toolCall.function.arguments),
      });
    });
  }
  return {
    role: msg.role,
    content,
  };
};

const transformToolMessageForAnthropic = (msg: Message): AnthropicMessage => {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: msg.content as string,
      },
    ],
  };
};

const BedrockAnthropicChatCompleteConfig: ProviderConfig = {
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: Params) => {
        const messages: AnthropicMessage[] = [];
        // Transform the chat messages into a simple prompt
        if (params.messages) {
          params.messages.forEach((msg) => {
            if (msg.role === 'system') return;

            if (msg.role === 'assistant') {
              messages.push(transformAssistantMessageForAnthropic(msg));
            } else if (
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
            } else if (msg.role === 'tool') {
              // even though anthropic supports images in tool results, openai doesn't support it yet
              messages.push(transformToolMessageForAnthropic(msg));
            } else {
              messages.push({
                role: msg.role,
                content: msg.content,
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
        let systemMessage: string = '';
        // Transform the chat messages into a simple prompt
        if (params.messages) {
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
  tools: {
    param: 'tools',
    required: false,
    transform: (params: Params) => {
      const tools: AnthropicTool[] = [];
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
              },
            });
          }
        });
      }
      return tools;
    },
  },
  // None is not supported by Anthropic, defaults to auto
  tool_choice: {
    param: 'tool_choice',
    required: false,
    transform: (params: Params) => {
      if (params.tool_choice) {
        if (typeof params.tool_choice === 'string') {
          if (params.tool_choice === 'required') return { type: 'any' };
          else if (params.tool_choice === 'auto') return { type: 'auto' };
        } else if (typeof params.tool_choice === 'object') {
          return { type: 'tool', name: params.tool_choice.function.name };
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
    transform: (params: Params) => {
      if (params.stop === null) {
        return [];
      }
      return params.stop;
    },
  },
  user: {
    param: 'metadata.user_id',
  },
  anthropic_version: {
    param: 'anthropic_version',
    required: true,
    default: 'bedrock-2023-05-31',
  },
};

const BedrockCohereChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (params.messages) {
        const messages: Message[] = params.messages;
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

/*
  Helper function to use inside reduce to convert ContentType array to string
*/
const convertContentTypesToString = (acc: string, curr: ContentType) => {
  if (curr.type !== 'text') return acc;
  acc += curr.text + '\n';
  return acc;
};

/*
    Handle messages of both string and ContentType array
  */
const getMessageContent = (message: Message) => {
  if (message === undefined) return '';
  if (typeof message.content === 'object') {
    return message.content.reduce(convertContentTypesToString, '');
  }
  return message.content || '';
};

/*
  This function transforms the messages for the LLama 3.1 prompt.
  It adds the special tokens to the beginning and end of the prompt.
  refer: https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_1
  NOTE: Portkey does not restrict messages to alternate user and assistant roles, this is to support more flexible use cases.
*/
const transformMessagesForLLama3Prompt = (messages: Message[]) => {
  let prompt: string = '';
  prompt += LLAMA_3_SPECIAL_TOKENS.PROMPT_START + '\n';
  messages.forEach((msg) => {
    prompt +=
      LLAMA_3_SPECIAL_TOKENS.ROLE_START +
      msg.role +
      LLAMA_3_SPECIAL_TOKENS.ROLE_END +
      '\n';
    prompt += getMessageContent(msg) + LLAMA_3_SPECIAL_TOKENS.END_OF_TURN;
  });
  prompt +=
    LLAMA_3_SPECIAL_TOKENS.ROLE_START +
    MESSAGE_ROLES.ASSISTANT +
    LLAMA_3_SPECIAL_TOKENS.ROLE_END +
    '\n';
  return prompt;
};

/*
    This function transforms the messages for the LLama 2 prompt.
    It combines the system message with the first user message,
    and then attaches the message pairs.
    Finally, it adds the last message to the prompt.
    refer: https://github.com/meta-llama/llama/blob/main/llama/generation.py#L284-L395
  */
const transformMessagesForLLama2Prompt = (messages: Message[]) => {
  let finalPrompt: string = '';
  // combine system message with first user message
  if (messages.length > 0 && messages[0].role === MESSAGE_ROLES.SYSTEM) {
    messages[0].content =
      LLAMA_2_SPECIAL_TOKENS.SYSTEM_MESSAGE_START +
      getMessageContent(messages[0]) +
      LLAMA_2_SPECIAL_TOKENS.SYSTEM_MESSAGE_END +
      getMessageContent(messages[1]);
  }
  messages = [messages[0], ...messages.slice(2)];
  // attach message pairs
  for (let i = 1; i < messages.length; i += 2) {
    const prompt = getMessageContent(messages[i - 1]);
    const answer = getMessageContent(messages[i]);
    finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${prompt} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END} ${answer} ${LLAMA_2_SPECIAL_TOKENS.END_OF_SENTENCE}`;
  }
  if (messages.length % 2 === 1) {
    finalPrompt += `${LLAMA_2_SPECIAL_TOKENS.BEGINNING_OF_SENTENCE}${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_START} ${getMessageContent(messages[messages.length - 1])} ${LLAMA_2_SPECIAL_TOKENS.CONVERSATION_TURN_END}`;
  }
  return finalPrompt;
};

/*
  refer: https://docs.mistral.ai/guides/tokenization/
  refer: https://github.com/chujiezheng/chat_templates/blob/main/chat_templates/mistral-instruct.jinja
  */
const transformMessagesForMistralPrompt = (messages: Message[]) => {
  let finalPrompt: string = `${MISTRAL_CONTROL_TOKENS.BEGINNING_OF_SENTENCE}`;
  // Mistral does not support system messages. (ref: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3/discussions/14)
  if (messages.length > 0 && messages[0].role === MESSAGE_ROLES.SYSTEM) {
    messages[0].content =
      getMessageContent(messages[0]) + '\n' + getMessageContent(messages[1]);
    messages[0].role = MESSAGE_ROLES.USER;
  }
  for (const message of messages) {
    if (message.role === MESSAGE_ROLES.USER) {
      finalPrompt += `${MISTRAL_CONTROL_TOKENS.CONVERSATION_TURN_START} ${message.content} ${MISTRAL_CONTROL_TOKENS.CONVERSATION_TURN_END}`;
    } else {
      finalPrompt += ` ${message.content} ${MISTRAL_CONTROL_TOKENS.END_OF_SENTENCE}`;
    }
  }
  return finalPrompt;
};

const BedrockLlama2ChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      if (!params.messages) return '';
      return transformMessagesForLLama2Prompt(params.messages);
    },
  },
  max_tokens: {
    param: 'max_gen_len',
    default: 512,
    min: 1,
    max: 2048,
  },
  max_completion_tokens: {
    param: 'max_gen_len',
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
};

const BedrockLlama3ChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      if (!params.messages) return '';
      return transformMessagesForLLama3Prompt(params.messages);
    },
  },
  max_tokens: {
    param: 'max_gen_len',
    default: 512,
    min: 1,
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
};

const BedrockMistralChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (params.messages)
        prompt = transformMessagesForMistralPrompt(params.messages);
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
    param: 'top_p',
    default: 0.75,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'top_k',
    default: 0,
    max: 200,
  },
  stop: {
    param: 'stop',
  },
};

const transformTitanGenerationConfig = (params: Params) => {
  const generationConfig: Record<string, any> = {};
  if (params['temperature']) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['max_tokens']) {
    generationConfig['maxTokenCount'] = params['max_tokens'];
  }
  if (params['max_completion_tokens']) {
    generationConfig['maxTokenCount'] = params['max_completion_tokens'];
  }
  if (params['stop']) {
    generationConfig['stopSequences'] = params['stop'];
  }
  return generationConfig;
};

const BedrockTitanChatompleteConfig: ProviderConfig = {
  messages: {
    param: 'inputText',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (params.messages) {
        const messages: Message[] = params.messages;
        messages.forEach((msg) => {
          if (msg.role === 'system') {
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
  temperature: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
  max_tokens: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
  max_completion_tokens: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
  top_p: {
    param: 'textGenerationConfig',
    transform: (params: Params) => transformTitanGenerationConfig(params),
  },
};

const BedrockAI21ChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'prompt',
    required: true,
    transform: (params: Params) => {
      let prompt: string = '';
      if (params.messages) {
        const messages: Message[] = params.messages;
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

export const BedrockLlamaChatCompleteResponseTransform: (
  response: BedrockLlamaCompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('generation' in response) {
    return {
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
            content: response.generation,
          },
          finish_reason: response.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: response.prompt_token_count,
        completion_tokens: response.generation_token_count,
        total_tokens:
          response.prompt_token_count + response.generation_token_count,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockTitanChatCompleteResponseTransform: (
  response: BedrockTitanCompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('results' in response) {
    const completionTokens = response.results
      .map((r) => r.tokenCount)
      .reduce((partialSum, a) => partialSum + a, 0);
    return {
      id: Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: BEDROCK,
      choices: response.results.map((generation, index) => ({
        index: index,
        message: {
          role: 'assistant',
          content: generation.outputText,
        },
        finish_reason: generation.completionReason,
      })),
      usage: {
        prompt_tokens: response.inputTextTokenCount,
        completion_tokens: completionTokens,
        total_tokens: response.inputTextTokenCount + completionTokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockAI21ChatCompleteResponseTransform: (
  response: BedrockAI21CompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('completions' in response) {
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
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

interface BedrockAnthropicChatCompleteResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentItem[];
  stop_reason: string;
  model: string;
  stop_sequence: null | string;
}

export const BedrockAnthropicChatCompleteResponseTransform: (
  response: BedrockAnthropicChatCompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('content' in response) {
    let content = '';
    if (response.content.length && response.content[0].type === 'text') {
      content = response.content[0].text;
    }

    const toolCalls: any = [];
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
      provider: BEDROCK,
      choices: [
        {
          message: {
            role: 'assistant',
            content,
            tool_calls: toolCalls.length ? toolCalls : undefined,
          },
          index: 0,
          logprobs: null,
          finish_reason: response.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockCohereChatCompleteResponseTransform: (
  response: BedrockCohereCompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('generations' in response) {
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
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockMistralChatCompleteResponseTransform: (
  response: BedrockMistralCompleteResponse | BedrockErrorResponse
) => ChatCompletionResponse | ErrorResponse = (response) => {
  if ('outputs' in response) {
    return {
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
            content: response.outputs[0].text,
          },
          finish_reason: response.outputs[0].stop_reason,
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};

export const BedrockUploadFileTransformerConfig: Record<
  string,
  ProviderConfig
> = {
  anthropic: BedrockAnthropicChatCompleteConfig,
  cohere: BedrockCohereChatCompleteConfig,
  mistral: BedrockMistralChatCompleteConfig,
  titan: BedrockTitanChatompleteConfig,
  ai21: BedrockAI21ChatCompleteConfig,
  llama2: BedrockLlama2ChatCompleteConfig,
  llama3: BedrockLlama3ChatCompleteConfig,
};

export const BedrockUploadFileResponseTransforms: Record<string, any> = {
  anthropic: BedrockAnthropicChatCompleteResponseTransform,
  cohere: BedrockCohereChatCompleteResponseTransform,
  mistral: BedrockMistralChatCompleteResponseTransform,
  titan: BedrockTitanChatCompleteResponseTransform,
  ai21: BedrockAI21ChatCompleteResponseTransform,
  llama2: BedrockLlamaChatCompleteResponseTransform,
  llama3: BedrockLlamaChatCompleteResponseTransform,
};

type BedrockChatCompletionLine = {
  system: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
  }>;
};
const chatCompletionLineSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
});

const textSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
});

const chatCompletionTransform = chatCompletionLineSchema.transform((data) => {
  const chunk: {
    system: string;
    messages: BedrockChatCompletionLine['messages'];
  } = { system: '', messages: [] };
  const [firstMessage, ...rest] = data.messages;

  if (rest.at(0)?.role !== 'user') {
    return null;
  }

  if (rest.at(-1)?.role !== 'assistant') {
    return null;
  }

  if (firstMessage && firstMessage.role === 'system') {
    chunk['system'] = firstMessage.content;
  }

  // Assuming message roles are alternating
  chunk['messages'] = rest as BedrockChatCompletionLine['messages'];
  return chunk;
});

const chatToTextTransform = chatCompletionTransform.transform((data) => {
  const messages = data?.messages ?? [];

  if (messages.length === 0) {
    return null;
  }

  if (messages.at(0)?.role === 'system') {
    messages.splice(0, 1);
  }

  if (messages.length > 2) {
    return null;
  }

  if (messages.at(0)?.role !== 'user') {
    // Invalid dataset
    return null;
  }

  if (messages.at(-1)?.role !== 'assistant') {
    // Invalid dataset
    return null;
  }

  for (let index = 0; index < messages.length; index += 2) {
    const userMessage = messages.at(index);
    const assistantMessage = messages.at(index + 1);

    if (userMessage?.role === 'tool' || assistantMessage?.role === 'tool') {
      return null;
    }

    return {
      completion: assistantMessage?.content ?? '',
      prompt: userMessage?.content ?? '',
    };
  }
});

export const transformFinetuneDatasetLine = (json: any) => {
  const parseResult = chatCompletionTransform.safeParse(json);
  if (!parseResult.success) {
    return null;
  }
  return parseResult.data;
};

export const tryChatToTextTransformation = (json: any) => {
  const parseResult = chatCompletionLineSchema.safeParse(json);
  const textSchemaResult = textSchema.safeParse(json);
  // invalid chunk that doesn't follow either chat or text-to-text data.
  if (!parseResult.success && !textSchemaResult.success) {
    return null;
  }

  // follows text-to-text data
  if (textSchemaResult.success) {
    return json;
  }

  // follows chat data, transform to text-to-text data
  if (parseResult.success) {
    const transformed = chatToTextTransform.safeParse(parseResult.data);
    return transformed.success ? transformed.data : null;
  }

  return null;
};
