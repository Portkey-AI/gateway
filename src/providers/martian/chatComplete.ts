import { MARTIAN, ANTHROPIC } from '../../globals'
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../../types'
import { MartianErrorResponseTransform } from './utils'

export const MartianChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'router',
  },
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: 'n',
    default: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stop: {
    param: 'stop',
  },
  max_cost: {
    param: 'max_cost',
  },
  max_cost_per_million_tokens: {
    param: 'max_cost_per_million_tokens',
  },
  models: {
    param: 'models',
  },
  willingness_to_pay: {
    param: 'willingness_to_pay',
  },
  extra: {
    param: 'extra',
  },
}

export interface MartianChatCompleteResponse extends ChatCompletionResponse {
  system_fingerprint: string
}

export const MartianChatCompleteResponseTransform: (
  response: MartianChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return MartianErrorResponseTransform(response, MARTIAN)
  }

  return response
}

/**
 * Transforms an Martian-format chat completions JSON response into an array of formatted Martian compatible text/event-stream chunks.
 *
 * @param {Object} response - The MartianChatCompleteResponse object.
 * @param {string} provider - The provider string.
 * @returns {Array<string>} - An array of formatted stream chunks.
 */
export const MartianChatCompleteJSONToStreamResponseTransform: (
  response: MartianChatCompleteResponse,
  provider: string
) => Array<string> = (response, provider) => {
  const streamChunkArray: Array<string> = [];
  const { id, model, system_fingerprint, choices } = response;

  const {
    prompt_tokens,
    completion_tokens,
    cache_read_input_tokens,
    cache_creation_input_tokens,
  } = response.usage || {};

  let total_tokens;
  if (prompt_tokens && completion_tokens)
    total_tokens = prompt_tokens + completion_tokens;

  const shouldSendCacheUsage =
    provider === ANTHROPIC &&
    (Number.isInteger(cache_read_input_tokens) ||
      Number.isInteger(cache_creation_input_tokens));

  const streamChunkTemplate: Record<string, any> = {
    id,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: model || '',
    system_fingerprint: system_fingerprint || null,
    provider,
    usage: {
      ...(completion_tokens && { completion_tokens }),
      ...(prompt_tokens && { prompt_tokens }),
      ...(total_tokens && { total_tokens }),
      ...(shouldSendCacheUsage && {
        cache_read_input_tokens,
        cache_creation_input_tokens,
      }),
    },
  };

  for (const [index, choice] of choices.entries()) {
    if (
      choice.message &&
      choice.message.tool_calls &&
      choice.message.tool_calls.length
    ) {
      for (const [
        toolCallIndex,
        toolCall,
      ] of choice.message.tool_calls.entries()) {
        const toolCallNameChunk = {
          index: toolCallIndex,
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: '',
          },
        };

        const toolCallArgumentChunk = {
          index: toolCallIndex,
          function: {
            arguments: toolCall.function.arguments,
          },
        };

        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [toolCallNameChunk],
                },
              },
            ],
          })}\n\n`
        );

        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  tool_calls: [toolCallArgumentChunk],
                },
              },
            ],
          })}\n\n`
        );
      }
    }

    if (
      choice.message &&
      choice.message.content &&
      typeof choice.message.content === 'string'
    ) {
      const inidividualWords: Array<string> = [];
      for (let i = 0; i < choice.message.content.length; i += 4) {
        inidividualWords.push(choice.message.content.slice(i, i + 4));
      }
      inidividualWords.forEach((word: string) => {
        streamChunkArray.push(
          `data: ${JSON.stringify({
            ...streamChunkTemplate,
            choices: [
              {
                index: index,
                delta: {
                  role: 'assistant',
                  content: word,
                },
              },
            ],
          })}\n\n`
        );
      });
    }

    streamChunkArray.push(
      `data: ${JSON.stringify({
        ...streamChunkTemplate,
        choices: [
          {
            index: index,
            delta: {},
            finish_reason: choice.finish_reason,
          },
        ],
      })}\n\n`
    );
  }

  streamChunkArray.push(`data: [DONE]\n\n`);
  return streamChunkArray;
};
