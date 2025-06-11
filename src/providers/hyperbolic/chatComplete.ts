import { HYPERBOLIC } from '../../globals';
interface HyperbolicStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role?: string | null;
      content?: string;
    };
    finish_reason: string | null;
  }[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
    completion_tokens: number;
  };
}

export const HyperbolicChatCompleteStreamChunkTransform = (
  responseChunk: string
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  try {
    const parsedChunk: HyperbolicStreamChunk = JSON.parse(chunk);
    return (
      `data: ${JSON.stringify({
        id: parsedChunk.id,
        object: parsedChunk.object,
        created: parsedChunk.created,
        model: parsedChunk.model,
        provider: HYPERBOLIC,
        choices: [
          {
            index: parsedChunk.choices[0].index,
            message: parsedChunk.choices[0].message,
            finish_reason: parsedChunk.choices[0].finish_reason,
          },
        ],
        usage: {
          prompt_tokens: parsedChunk.usage.prompt_tokens,
          total_tokens: parsedChunk.usage.total_tokens,
          completion_tokens: parsedChunk.usage.completion_tokens,
        },
      })}` + '\n\n'
    );
  } catch (error) {
    console.error('Error parsing Hyperbolic stream chunk:', error);
    return `data: ${chunk}\n\n`;
  }
};
