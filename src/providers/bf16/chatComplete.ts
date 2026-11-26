import { BF16 } from '../../globals';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';
import { ParameterConfig, ProviderConfig } from '../types';

const bf16ModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const BF16ChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...bf16ModelConfig,
    default: 'deepseek/deepseek-v4.1-flash-uncensored',
  },
};

interface BF16StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    finish_reason: string | null;
    logprobs?: unknown;
  }>;
  usage?: Record<string, unknown>;
  system_fingerprint?: string | null;
  [key: string]: unknown;
}

export const BF16ChatCompleteStreamChunkTransform = (
  responseChunk: string
): string => {
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
    const parsedChunk: BF16StreamChunk = JSON.parse(chunk);

    if (!parsedChunk?.choices?.length) {
      return `data: ${JSON.stringify({ ...parsedChunk, provider: BF16 })}\n\n`;
    }

    return (
      `data: ${JSON.stringify({
        ...parsedChunk,
        provider: BF16,
      })}` + '\n\n'
    );
  } catch {
    return `data: ${chunk}\n\n`;
  }
};
