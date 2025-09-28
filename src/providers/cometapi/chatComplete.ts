import { COMETAPI } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ParameterConfig,
  ProviderConfig,
} from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';
import { generateInvalidProviderResponseError } from '../utils';

const cometAPIModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const CometAPIChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...cometAPIModelConfig,
    default: 'gpt-5-chat-latest',
  },
};

export const CometAPIChatCompleteResponseTransform: (
  response: ChatCompletionResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return OpenAIErrorResponseTransform(response, COMETAPI);
  }

  if ('choices' in response) {
    return {
      ...response,
      provider: COMETAPI,
    };
  }

  return generateInvalidProviderResponseError(
    response as Record<string, any>,
    COMETAPI
  );
};

interface CometAPIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    index: number;
    finish_reason: string | null;
    logprobs?: unknown;
  }[];
  usage?: Record<string, unknown>;
  system_fingerprint?: string | null;
}

export const CometAPIChatCompleteStreamChunkTransform: (
  responseChunk: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();

  if (!chunk) {
    return '';
  }

  if (chunk.startsWith('data:')) {
    chunk = chunk.slice(5).trim();
  }

  if (!chunk) {
    return '';
  }

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: CometAPIStreamChunk = JSON.parse(chunk);

    if (!parsedChunk?.choices?.length) {
      return `data: ${chunk}\n\n`;
    }

    return (
      `data: ${JSON.stringify({
        ...parsedChunk,
        provider: COMETAPI,
      })}` + '\n\n'
    );
  } catch (error) {
    const globalConsole = (globalThis as Record<string, any>).console;
    if (typeof globalConsole?.error === 'function') {
      globalConsole.error('Error parsing CometAPI stream chunk:', error);
    }
    return `data: ${chunk}\n\n`;
  }
};
