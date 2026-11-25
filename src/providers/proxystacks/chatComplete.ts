import { PROXYSTACKS } from '../../globals';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ParameterConfig,
  ProviderConfig,
} from '../types';

const proxyStacksModelConfig =
  OpenAIChatCompleteConfig.model as ParameterConfig;

export const ProxyStacksChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...proxyStacksModelConfig,
    default: 'kimi-k3.1-pro',
  },
};

export const ProxyStacksChatCompleteResponseTransform: (
  response: ChatCompletionResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, PROXYSTACKS);
  }

  Object.defineProperty(response, 'provider', {
    value: PROXYSTACKS,
    enumerable: true,
  });

  return response;
};

interface ProxyStacksStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: {
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    index: number;
    finish_reason: string | null;
    logprobs?: unknown;
  }[];
  usage?: Record<string, unknown>;
  system_fingerprint?: string | null;
}

export const ProxyStacksChatCompleteStreamChunkTransform: (
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
    const parsedChunk: ProxyStacksStreamChunk = JSON.parse(chunk);

    if (!parsedChunk?.choices?.length && !parsedChunk?.usage) {
      return `data: ${chunk}\n\n`;
    }

    return (
      `data: ${JSON.stringify({
        ...parsedChunk,
        provider: PROXYSTACKS,
      })}` + '\n\n'
    );
  } catch {
    return `data: ${chunk}\n\n`;
  }
};
