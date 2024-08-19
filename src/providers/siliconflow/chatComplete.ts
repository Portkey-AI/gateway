import { SILICON_FLOW } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateErrorResponse } from '../utils';

export const SiliconFlowAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'deepseek-ai/DeepSeek-V2-Chat',
  },
  messages: {
    param: 'messages',
    default: '',
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
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
  },
};

export const SiliconFlowAIErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      ...response.error,
    },
    provider
  );
};

export const SiliconFlowAIChatCompleteResponseTransform: (
  response: ChatCompletionResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return SiliconFlowAIErrorResponseTransform(response, SILICON_FLOW);
  }

  return response;
};

/**
 * Transforms an SiliconFlowAI-format chat completions JSON response into an array of formatted SiliconFlowAI compatible text/event-stream chunks.
 *
 * @param {string} provider - The provider string.
 * @returns {Array<string>} - An array of formatted stream chunks.
 */
export const SiliconFlowAIChatCompleteJSONToStreamResponseTransform: (
  response: ChatCompletionResponse,
  provider: string
) => Array<string> = (response, provider) => {
  const streamChunkArray: Array<string> = [];
  const { id, model, choices } = response;

  const { prompt_tokens, completion_tokens } = response.usage || {};

  let total_tokens;
  if (prompt_tokens && completion_tokens)
    total_tokens = prompt_tokens + completion_tokens;

  const streamChunkTemplate: Record<string, any> = {
    id,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: model || '',
    provider,
    usage: {
      ...(completion_tokens && { completion_tokens }),
      ...(prompt_tokens && { prompt_tokens }),
      ...(total_tokens && { total_tokens }),
    },
  };

  for (const [index, choice] of choices.entries()) {
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
