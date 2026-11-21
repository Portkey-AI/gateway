import { LLMTR, VALID_PROVIDERS } from '../../globals';
import LlmtrAPIConfig from './api';

describe('LLMTR provider', () => {
  it('is listed as a valid provider', () => {
    expect(VALID_PROVIDERS).toContain(LLMTR);
    expect(LLMTR).toBe('llmtr');
  });

  it('talks to the OpenAI-compatible chat completions endpoint', () => {
    expect(LlmtrAPIConfig.getBaseURL({} as any)).toBe('https://llmtr.com/v1');
    expect(LlmtrAPIConfig.getEndpoint({ fn: 'chatComplete' } as any)).toBe(
      '/chat/completions'
    );
    expect(
      LlmtrAPIConfig.headers({ providerOptions: { apiKey: 'k' } } as any)
    ).toEqual({ Authorization: 'Bearer k' });
  });
});
