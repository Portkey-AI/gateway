import AI21APIConfig from './api';
import {
  AI21ChatCompleteConfig,
  AI21ChatCompleteResponseTransform,
  AI21ChatCompleteStreamChunkTransform,
} from './chatComplete';

describe('AI21 chatComplete migration', () => {
  test('chatComplete hits the OpenAI-compatible /chat/completions endpoint', () => {
    const endpoint = AI21APIConfig.getEndpoint({
      fn: 'chatComplete',
      gatewayRequestBodyJSON: { model: 'jamba-mini' },
    } as any);
    expect(endpoint).toBe('/chat/completions');
  });

  test('config forwards messages untouched (system role stays in the array)', () => {
    expect((AI21ChatCompleteConfig.messages as any).param).toBe('messages');
    // no bespoke transform pulling the system message into a separate field
    expect((AI21ChatCompleteConfig.messages as any).transform).toBeUndefined();
    expect((AI21ChatCompleteConfig as any).system).toBeUndefined();
  });

  test('maps an OpenAI-shaped response into the gateway format', () => {
    const upstream = {
      id: 'chat-abc',
      model: 'jamba-mini',
      object: 'chat.completion',
      created: 1710000000,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'hi there' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 3,
        total_tokens: 14,
      },
    };

    const result = AI21ChatCompleteResponseTransform(
      upstream as any,
      200
    ) as any;
    expect(result.provider).toBe('ai21');
    expect(result.model).toBe('jamba-mini');
    expect(result.choices[0].message.content).toBe('hi there');
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 3,
      total_tokens: 14,
    });
  });

  test('surfaces the AI21 error detail on a non-200', () => {
    const result = AI21ChatCompleteResponseTransform(
      { detail: 'model not found' } as any,
      404
    ) as any;
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('model not found');
  });

  test('stream chunks are rewritten with the ai21 provider tag', () => {
    const raw =
      'data: ' +
      JSON.stringify({
        id: 'chat-abc',
        object: 'chat.completion.chunk',
        created: 1710000000,
        model: 'jamba-mini',
        choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      });

    const out = AI21ChatCompleteStreamChunkTransform(raw);
    expect(out.startsWith('data: ')).toBe(true);
    const parsed = JSON.parse(out.replace(/^data: /, '').trim());
    expect(parsed.provider).toBe('ai21');
    expect(parsed.choices[0].delta.content).toBe('hi');
  });

  test('passes through the [DONE] sentinel', () => {
    expect(AI21ChatCompleteStreamChunkTransform('data: [DONE]')).toBe(
      'data: [DONE]\n\n'
    );
  });
});
