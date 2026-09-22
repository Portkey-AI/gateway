import { handleStreamingMode } from './streamHandler';
import { endpointStrings } from '../providers/types';

/**
 * Builds a Response whose body is a ReadableStream that yields a few
 * SSE-style chunks and then rejects (simulating an upstream connection
 * that is reset/terminated mid-stream instead of ending cleanly).
 */
function buildAbruptlyTerminatedResponse() {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
  ];
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
        return;
      }
      // Simulate an abrupt disconnect: the upstream connection drops
      // instead of the stream ending with a terminal chunk.
      controller.error(new TypeError('terminated'));
    },
  });

  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function readAllText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe('handleStreamingMode', () => {
  it('surfaces an in-band error event when the upstream stream is abruptly terminated', async () => {
    const response = handleStreamingMode(
      buildAbruptlyTerminatedResponse(),
      'openai',
      undefined,
      'https://api.openai.com/v1/chat/completions',
      false,
      {} as any,
      'chatComplete' as endpointStrings,
      {} as any
    );

    const text = await readAllText(response);

    // The partial content that arrived before the disconnect is still
    // forwarded to the client.
    expect(text).toContain('Hel');
    expect(text).toContain('lo');

    // The abrupt termination must be surfaced in-band so the client can
    // tell a cut-off answer from a complete one, instead of the gateway
    // silently closing the response as if it succeeded.
    expect(text).toContain('gateway_stream_interrupted');
    expect(text).toContain('stream_interrupted');
  });

  it('does not emit an error chunk when the stream completes cleanly', async () => {
    const encoder = new TextEncoder();
    const cleanChunks = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    let index = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < cleanChunks.length) {
          controller.enqueue(encoder.encode(cleanChunks[index]));
          index += 1;
          return;
        }
        controller.close();
      },
    });
    const response = handleStreamingMode(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      'openai',
      undefined,
      'https://api.openai.com/v1/chat/completions',
      false,
      {} as any,
      'chatComplete' as endpointStrings,
      {} as any
    );

    const text = await readAllText(response);

    expect(text).toContain('[DONE]');
    expect(text).not.toContain('gateway_stream_interrupted');
  });
});
