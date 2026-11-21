import { CROWLLM } from '../../globals';
import { ParameterConfig, ProviderConfig } from '../types';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';

const crowllmModelConfig = OpenAIChatCompleteConfig.model as ParameterConfig;

export const CrowLLMChatCompleteConfig: ProviderConfig = {
  ...OpenAIChatCompleteConfig,
  model: {
    ...crowllmModelConfig,
    default: 'deepseek-v4-flash',
  },
};

export const CrowLLMChatCompleteStreamChunkTransform = (
  responseChunk: string
) => {
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

  const parsedChunk = JSON.parse(chunk);

  if (!parsedChunk?.choices?.length) {
    return `data: ${chunk}\n\n`;
  }

  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      provider: CROWLLM,
    })}` + '\n\n'
  );
};
