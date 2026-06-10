import { handler } from './guardrails';

// Isolate the handler from content-extraction internals.
jest.mock('../utils', () => ({
  getCurrentContentPart: jest.fn(() => ({
    content: 'hello',
    textArray: ['hello'],
  })),
}));

const TOKEN_BODY = { access_token: 'jwt-abc', expires_in: 3600 };

function fetchResp(json: any, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'ERR',
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
}

const ctx: any = {
  request: { json: { messages: [{ role: 'user', content: 'hello' }] } },
  requestType: 'chatComplete',
};

let counter = 0;
function creds(overrides: Record<string, any> = {}) {
  // Unique apiKey per test avoids module-level token-cache bleed.
  counter += 1;
  return {
    apiKey: `hf_sk_${counter}`,
    application: 'my-app',
    domain: 'api.highflame.ai',
    ...overrides,
  };
}

beforeEach(() => {
  (global as any).fetch = jest.fn();
});

describe('highflame guardrail', () => {
  it('errors (fail-open) when apiKey is missing', async () => {
    const res = await handler(
      ctx,
      { credentials: { application: 'my-app' } } as any,
      'beforeRequestHook' as any,
      {} as any
    );
    expect(res.verdict).toBe(true);
    expect(res.error).toBeTruthy();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('errors (fail-open) when application is missing', async () => {
    const res = await handler(
      ctx,
      { credentials: { apiKey: 'hf_sk_x' } } as any,
      'beforeRequestHook' as any,
      {} as any
    );
    expect(res.verdict).toBe(true);
    expect(res.error).toBeTruthy();
  });

  it('allows safe content and sends a bearer token to /v1/shield/guard', async () => {
    (global as any).fetch
      .mockResolvedValueOnce(fetchResp(TOKEN_BODY))
      .mockResolvedValueOnce(fetchResp({ decision: 'allow', signals: [] }));

    const res = await handler(
      ctx,
      { credentials: creds(), capabilities: ['prompt_injection'] } as any,
      'beforeRequestHook' as any,
      {} as any
    );

    expect(res.verdict).toBe(true);
    expect(res.data.decision).toBe('allow');

    const guardCall = (global as any).fetch.mock.calls[1];
    expect(guardCall[0]).toBe('https://api.highflame.ai/v1/shield/guard');
    expect(guardCall[1].headers.Authorization).toBe('Bearer jwt-abc');
    const body = JSON.parse(guardCall[1].body);
    expect(body).toMatchObject({
      content: 'hello',
      content_type: 'prompt',
      action: 'process_prompt',
      mode: 'enforce',
      application: 'my-app',
      detectors: ['injection'],
    });
  });

  it('maps OWASP capabilities to Shield detector IDs', async () => {
    (global as any).fetch
      .mockResolvedValueOnce(fetchResp(TOKEN_BODY))
      .mockResolvedValueOnce(fetchResp({ decision: 'allow' }));

    await handler(
      ctx,
      {
        credentials: creds(),
        capabilities: ['prompt_injection', 'sensitive_information_disclosure'],
      } as any,
      'beforeRequestHook' as any,
      {} as any
    );

    const body = JSON.parse((global as any).fetch.mock.calls[1][1].body);
    expect(body.detectors).toEqual([
      'injection',
      'pii',
      'pii_model',
      'dlp',
      'secrets',
    ]);
  });

  it('blocks (verdict=false) when Shield denies', async () => {
    (global as any).fetch
      .mockResolvedValueOnce(fetchResp(TOKEN_BODY))
      .mockResolvedValueOnce(
        fetchResp({
          decision: 'deny',
          policy_reason: 'Prompt injection detected',
        })
      );

    const res = await handler(
      ctx,
      { credentials: creds() } as any,
      'beforeRequestHook' as any,
      {} as any
    );

    expect(res.verdict).toBe(false);
    expect(res.data.decision).toBe('deny');
  });

  it('fails open when the guard call errors', async () => {
    (global as any).fetch
      .mockResolvedValueOnce(fetchResp(TOKEN_BODY))
      .mockResolvedValueOnce(fetchResp({}, false));

    const res = await handler(
      ctx,
      { credentials: creds() } as any,
      'beforeRequestHook' as any,
      {} as any
    );

    expect(res.verdict).toBe(true);
    expect(res.error).toBeTruthy();
    expect(res.data).toBeNull();
  });

  it('caches the token across calls for the same key', async () => {
    const c = creds();
    (global as any).fetch
      .mockResolvedValueOnce(fetchResp(TOKEN_BODY))
      .mockResolvedValueOnce(fetchResp({ decision: 'allow' }))
      .mockResolvedValueOnce(fetchResp({ decision: 'allow' }));

    await handler(
      ctx,
      { credentials: c } as any,
      'beforeRequestHook' as any,
      {} as any
    );
    await handler(
      ctx,
      { credentials: c } as any,
      'beforeRequestHook' as any,
      {} as any
    );

    // 1 token exchange + 2 guard calls (token reused).
    expect((global as any).fetch).toHaveBeenCalledTimes(3);
    expect((global as any).fetch.mock.calls[0][0]).toBe(
      'https://auth.highflame.ai/oauth2/token'
    );
  });
});
