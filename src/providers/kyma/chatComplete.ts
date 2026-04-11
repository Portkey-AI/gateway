import { KYMA } from '../../globals';

interface KymaStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: object[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const KymaChatCompleteStreamChunkTransform = (
  responseChunk: string
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: KymaStreamChunk = JSON.parse(chunk);
    return (
      `data: ${JSON.stringify({
        id: parsedChunk.id,
        object: parsedChunk.object,
        created: parsedChunk.created,
        model: parsedChunk.model,
        provider: KYMA,
        choices: parsedChunk.choices.map((choice) => ({
          index: choice.index,
          delta: choice.delta,
          finish_reason: choice.finish_reason,
        })),
        usage: parsedChunk.usage,
      })}` + '\n\n'
    );
  } catch (error) {
    console.error(
      'Error parsing Kyma stream chunk:',
      error,
      'Chunk:',
      chunk
    );
    return `data: ${chunk}\n\n`;
  }
};
