/**
 * Integration tests for MiniMax provider.
 * These tests call the real MiniMax API and require MINIMAX_API_KEY env var.
 * Run with: npx jest src/tests/minimax.integration.test.ts
 */

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = 'https://api.minimax.io/v1';

const skipIfNoKey = MINIMAX_API_KEY ? describe : describe.skip;

skipIfNoKey('MiniMax integration tests', () => {
  test('non-streaming chat completion with MiniMax-M2.7', async () => {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
        max_tokens: 30,
        temperature: 1.0,
        stream: false,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('model');
    expect(data).toHaveProperty('choices');
    expect(data.choices.length).toBeGreaterThan(0);
    expect(data.choices[0]).toHaveProperty('message');
    expect(data.choices[0].message).toHaveProperty('content');
    expect(data).toHaveProperty('usage');
    expect(data.usage).toHaveProperty('prompt_tokens');
    expect(data.usage).toHaveProperty('completion_tokens');
    expect(data.usage).toHaveProperty('total_tokens');
  });

  test('streaming chat completion with MiniMax-M2.7-highspeed', async () => {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7-highspeed',
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 20,
        temperature: 1.0,
        stream: true,
      }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text
      .split('\n')
      .filter((line: string) => line.startsWith('data: '));
    expect(lines.length).toBeGreaterThan(0);

    // Check that the last meaningful chunk or a data chunk has proper structure
    const firstLine = lines[0];
    const firstData = JSON.parse(firstLine.replace('data: ', ''));
    expect(firstData).toHaveProperty('id');
    expect(firstData).toHaveProperty('model');
    expect(firstData).toHaveProperty('choices');

    // Verify at least one chunk has finish_reason
    const hasFinishReason = lines.some((line: string) => {
      try {
        const parsed = JSON.parse(line.replace('data: ', ''));
        return parsed.choices?.[0]?.finish_reason !== null;
      } catch {
        return false;
      }
    });
    expect(hasFinishReason).toBe(true);
  });

  test('error handling with invalid API key', async () => {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      }),
    });

    expect(response.status).not.toBe(200);
  });
});
