import { createLineSplitter } from '../streamHandlerUtils';

const encoder = new TextEncoder();

async function splitLines(chunks: Uint8Array[]): Promise<string[]> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const lines: string[] = [];
  const reader = input.pipeThrough(createLineSplitter()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) return lines;
    lines.push(value);
  }
}

describe('createLineSplitter', () => {
  it('preserves JSONL text at every UTF-8 byte boundary', async () => {
    const lines = ['{"text":"café 你好 🌍"}', '{"text":"こんにちは"}'];
    const bytes = encoder.encode(lines.join('\n'));
    for (let boundary = 1; boundary < bytes.length; boundary++) {
      await expect(
        splitLines([bytes.slice(0, boundary), bytes.slice(boundary)])
      ).resolves.toEqual(lines);
    }
  });

  it('keeps pending bytes isolated between concurrent streams', async () => {
    const texts = ['你好\n世界', '🌍\ncafé'];
    await expect(
      Promise.all(
        texts.map((text) =>
          splitLines(
            Array.from(encoder.encode(text), (byte) => Uint8Array.of(byte))
          )
        )
      )
    ).resolves.toEqual(texts.map((text) => text.split('\n')));
  });

  it('flushes an incomplete final character with normal replacement decoding', async () => {
    await expect(
      splitLines([encoder.encode('tail '), Uint8Array.of(0xe4)])
    ).resolves.toEqual(['tail \uFFFD']);
  });

  it('retains empty-line filtering, CRLF trimming, and final-line behavior', async () => {
    await expect(
      splitLines([
        encoder.encode(' \r\n first\r'),
        encoder.encode('\n\n last '),
      ])
    ).resolves.toEqual(['first', ' last ']);
    await expect(splitLines([])).resolves.toEqual([]);
  });
});
