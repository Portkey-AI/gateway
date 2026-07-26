import { GREENPT, VALID_PROVIDERS } from '../../globals';
import GreenPTAPIConfig from './api';

describe('GreenPT provider', () => {
  it('registers its OpenAI-compatible endpoints', () => {
    expect(VALID_PROVIDERS).toContain(GREENPT);
    expect(GreenPTAPIConfig.getBaseURL({} as never)).toBe(
      'https://api.greenpt.ai/v1'
    );
    expect(GreenPTAPIConfig.getEndpoint({ fn: 'chatComplete' } as never)).toBe(
      '/chat/completions'
    );
    expect(GreenPTAPIConfig.getEndpoint({ fn: 'embed' } as never)).toBe(
      '/embeddings'
    );
  });
});
