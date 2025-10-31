import { MATTERAI } from '../../globals';
import { ParameterConfig, ProviderConfig } from '../types';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';

const matterAIModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const MatterAIChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...matterAIModelConfig,
    default: 'axon',
  },
};

interface MatterAIStreamChunk {
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

export const MatterAIChatCompleteStreamChunkTransform: (
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

  const parsedChunk: MatterAIStreamChunk = JSON.parse(chunk);

  if (!parsedChunk?.choices?.length) {
    return `data: ${chunk}\n\n`;
  }

  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      provider: MATTERAI,
    })}` + '\n\n'
  );
};
