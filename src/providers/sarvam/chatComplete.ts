import { SARVAM } from '../../globals';
import { ParameterConfig, ProviderConfig } from '../types';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';

const sarvamModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const SarvamChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...sarvamModelConfig,
    default: 'sarvam-105b',
  },
};

interface SarvamStreamChunk {
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

export const SarvamChatCompleteStreamChunkTransform: (
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

  const parsedChunk: SarvamStreamChunk = JSON.parse(chunk);

  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      provider: SARVAM,
    })}` + '\n\n'
  );
};
