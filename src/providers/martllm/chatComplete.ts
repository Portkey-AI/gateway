import { MARTLLM } from '../../globals';

interface MartLLMStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta?: Record<string, unknown>;
    finish_reason: string | null;
  }[];
  usage?: Record<string, unknown>;
}

// Adds `provider` to each chunk and passes every other field through, so
// reasoning deltas and the usage block of the final chunk are kept.
export const MartLLMChatCompleteStreamChunkTransform = (
  responseChunk: string
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: MartLLMStreamChunk = JSON.parse(chunk);
    return (
      `data: ${JSON.stringify({
        ...parsedChunk,
        provider: MARTLLM,
      })}` + '\n\n'
    );
  } catch (error) {
    console.error(
      'Error parsing MartLLM stream chunk:',
      error,
      'Chunk:',
      chunk
    );
    return `data: ${chunk}\n\n`;
  }
};
