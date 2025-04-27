// import { INFERENCENET } from '../../globals';

export const InferenceNetChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let trimmedChunk = responseChunk.trim();

  if (trimmedChunk === 'data: [DONE]') {
    return responseChunk;
  }

  if (!trimmedChunk.startsWith('data: ')) {
    return responseChunk;
  }

  const parsedChunk = JSON.parse(trimmedChunk.replace(/^data: /, ''));
  return (
    `data: ${JSON.stringify({
      ...parsedChunk,
      // NOTE: Since were currently using this internally to fallback to testnet, we set the provider to 'inference-testnet'
      // so that our relay server can identify it properly
      provider: 'inference-testnet',
    })}` + '\n\n'
  );
};
