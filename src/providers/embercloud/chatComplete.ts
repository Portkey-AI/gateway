import { EMBER_CLOUD } from '../../globals';
import { ParameterConfig, ProviderConfig } from '../types';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';

const emberCloudModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const EmberCloudChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...emberCloudModelConfig,
    default: 'glm-4.7',
  },
};

interface EmberCloudStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    index: number;
    finish_reason: string | null;
  }[];
  usage?: Record<string, unknown>;
}

export const EmberCloudChatCompleteStreamChunkTransform: (
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

  const parsedChunk: EmberCloudStreamChunk = JSON.parse(chunk);

  if (!parsedChunk?.choices?.length) {
    return `data: ${chunk}\n\n`;
  }

  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      provider: EMBER_CLOUD,
    })}` + '\n\n'
  );
};
