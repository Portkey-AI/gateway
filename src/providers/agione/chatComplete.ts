import { AGIONE } from '../../globals';

interface AGIoneStreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: {
    index: number;
    delta?: Record<string, unknown>;
    message?: Record<string, unknown>;
    finish_reason?: string | null;
    logprobs?: unknown;
  }[];
  usage?: Record<string, unknown>;
  system_fingerprint?: string | null;
}

export const AGIoneChatCompleteStreamChunkTransform: (
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

  const parsedChunk: AGIoneStreamChunk = JSON.parse(chunk);

  if (!parsedChunk?.choices?.length) {
    return `data: ${chunk}\n\n`;
  }

  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      provider: AGIONE,
    })}` + '\n\n'
  );
};
