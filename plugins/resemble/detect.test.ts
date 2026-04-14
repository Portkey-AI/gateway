import {
  handler,
  extractMediaUrl,
  evaluateDetection,
  RESEMBLE_DEFAULT_BASE_URL,
} from './detect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(opts: {
  messages?: any[];
  prompt?: string;
  metadata?: Record<string, any>;
  requestType?: 'chatComplete' | 'complete' | 'messages';
}) {
  return {
    requestType: opts.requestType || 'chatComplete',
    request: {
      json: {
        messages: opts.messages,
        prompt: opts.prompt,
      },
      text: '',
    },
    metadata: opts.metadata || {},
  } as any;
}

function baseParameters(overrides: Record<string, any> = {}) {
  return {
    credentials: { apiKey: 'test-key' },
    threshold: 0.5,
    pollIntervalMs: 5, // tiny interval so polling tests run fast
    pollTimeoutMs: 500,
    timeout: 1000,
    ...overrides,
  };
}

/**
 * Minimal fetch mock. Each entry is keyed by URL substring; if the URL includes
 * the substring, the body is returned. Use `sequences` to simulate polling.
 */
function mockFetch(config: {
  create?: { ok?: boolean; status?: number; body: any };
  getSequence?: Array<{ ok?: boolean; status?: number; body: any }>;
  createError?: any;
}) {
  let getCalls = 0;
  const calls: { url: string; init?: RequestInit }[] = [];

  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    // POST /detect (creation)
    if (init?.method === 'POST' || (!init?.method && url.endsWith('/detect'))) {
      if (config.createError) throw config.createError;
      const c = config.create!;
      return fakeResponse(c.ok ?? true, c.status ?? 200, c.body);
    }
    // GET /detect/{uuid}
    const seq = config.getSequence || [];
    const entry = seq[getCalls] || seq[seq.length - 1];
    getCalls += 1;
    return fakeResponse(entry.ok ?? true, entry.status ?? 200, entry.body);
  }) as any;

  (fn as any).calls = calls;
  return fn;
}

function fakeResponse(ok: boolean, status: number, body: any) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Map() as any,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any;
}

// ---------------------------------------------------------------------------
// Unit tests: helpers
// ---------------------------------------------------------------------------

describe('extractMediaUrl', () => {
  it('finds an https audio URL in plain text content', () => {
    const context = makeContext({
      messages: [
        {
          role: 'user',
          content: 'Please check https://cdn.example.com/clip.mp3 for me',
        },
      ],
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBe('https://cdn.example.com/clip.mp3');
  });

  it('finds a URL in an OpenAI-style image_url content part', () => {
    const context = makeContext({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Is this real?' },
            {
              type: 'image_url',
              image_url: { url: 'https://cdn.example.com/face.png' },
            },
          ],
        },
      ],
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBe('https://cdn.example.com/face.png');
  });

  it('finds a URL in an OpenAI-style input_audio content part', () => {
    const context = makeContext({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { url: 'https://cdn.example.com/a.wav' },
            },
          ],
        },
      ],
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBe('https://cdn.example.com/a.wav');
  });

  it('finds a URL in an Anthropic-style image source.url', () => {
    const context = makeContext({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: 'https://cdn.example.com/x.jpg' },
            },
          ],
        },
      ],
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBe('https://cdn.example.com/x.jpg');
  });

  it('falls back to metadata when no URL in content and urlSource=auto', () => {
    const context = makeContext({
      messages: [{ role: 'user', content: 'hello there' }],
      metadata: { mediaUrl: 'https://cdn.example.com/clip.mp4' },
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBe('https://cdn.example.com/clip.mp4');
  });

  it('uses only metadata when urlSource=metadata', () => {
    const context = makeContext({
      messages: [
        { role: 'user', content: 'https://cdn.example.com/in_text.mp3' },
      ],
      metadata: { customKey: 'https://cdn.example.com/from_meta.mp3' },
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'metadata', 'customKey')
    ).toBe('https://cdn.example.com/from_meta.mp3');
  });

  it('returns null when no URL is found', () => {
    const context = makeContext({
      messages: [{ role: 'user', content: 'nothing to see here' }],
    });
    expect(
      extractMediaUrl(context, 'beforeRequestHook', 'auto', 'mediaUrl')
    ).toBeNull();
  });
});

describe('evaluateDetection', () => {
  it('treats label=fake as failing regardless of score', () => {
    const result = evaluateDetection(
      {
        uuid: 'u',
        status: 'completed',
        metrics: { label: 'fake', score: ['0.1'], aggregated_score: '0.2' },
      } as any,
      0.5
    );
    expect(result.verdict).toBe(false);
    expect(result.label).toBe('fake');
  });

  it('treats label=real with low score as passing', () => {
    const result = evaluateDetection(
      {
        uuid: 'u',
        status: 'completed',
        metrics: { label: 'real', score: ['0.1'], aggregated_score: '0.1' },
      } as any,
      0.5
    );
    expect(result.verdict).toBe(true);
    expect(result.label).toBe('real');
  });

  it('treats label=real but score >= threshold as failing', () => {
    const result = evaluateDetection(
      {
        uuid: 'u',
        status: 'completed',
        metrics: { label: 'real', score: ['0.7'], aggregated_score: '0.7' },
      } as any,
      0.5
    );
    expect(result.verdict).toBe(false);
  });

  it('handles image_metrics shape', () => {
    const result = evaluateDetection(
      {
        uuid: 'u',
        status: 'completed',
        image_metrics: { label: 'Fake', score: 0.9 },
      } as any,
      0.5
    );
    expect(result.verdict).toBe(false);
    expect(result.score).toBe(0.9);
  });

  it('handles video_metrics shape', () => {
    const result = evaluateDetection(
      {
        uuid: 'u',
        status: 'completed',
        video_metrics: { label: 'Real', score: 0.2 },
      } as any,
      0.5
    );
    expect(result.verdict).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Handler integration tests (with mocked fetch)
// ---------------------------------------------------------------------------

describe('detect handler', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  it('passes through when credentials are missing (fail-open default)', async () => {
    const context = makeContext({
      messages: [{ role: 'user', content: 'hi' }],
    });
    const result = await handler(
      context,
      { credentials: {} } as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toEqual({ reason: 'missing_credentials' });
  });

  it('blocks when credentials are missing and failClosed=true', async () => {
    const context = makeContext({
      messages: [{ role: 'user', content: 'hi' }],
    });
    const result = await handler(
      context,
      { credentials: {}, failClosed: true } as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(false);
  });

  it('passes through when no media URL is found', async () => {
    const context = makeContext({
      messages: [{ role: 'user', content: 'no url in this text' }],
    });
    const result = await handler(
      context,
      baseParameters() as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(true);
    expect(result.data?.reason).toBe('no_media_url_found');
  });

  it('returns verdict=true when Resemble labels audio as real (polling path)', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: { uuid: 'abc-123', status: 'processing' },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: { uuid: 'abc-123', status: 'processing' },
            },
          },
          {
            body: {
              success: true,
              item: {
                uuid: 'abc-123',
                media_type: 'audio',
                status: 'completed',
                metrics: {
                  label: 'real',
                  score: ['0.1', '0.2'],
                  aggregated_score: '0.15',
                  consistency: '0.9',
                },
              },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [
        {
          role: 'user',
          content: 'check https://cdn.example.com/audio.mp3 please',
        },
      ],
    });
    const result = await handler(
      context,
      baseParameters() as any,
      'beforeRequestHook'
    );
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data?.uuid).toBe('abc-123');
    expect(result.data?.label).toBe('real');
    expect(result.data?.mediaUrl).toBe('https://cdn.example.com/audio.mp3');
  });

  it('returns verdict=false when Resemble labels audio as fake', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: { uuid: 'fake-1', status: 'processing' },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: {
                uuid: 'fake-1',
                media_type: 'audio',
                status: 'completed',
                metrics: {
                  label: 'fake',
                  score: ['0.9'],
                  aggregated_score: '0.91',
                  consistency: '0.95',
                },
                audio_source_tracing: {
                  label: 'elevenlabs',
                  error_message: null,
                },
              },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [
        { role: 'user', content: 'https://cdn.example.com/cloned.wav fake?' },
      ],
    });
    const result = await handler(
      context,
      baseParameters({ audioSourceTracing: true }) as any,
      'beforeRequestHook'
    );
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data?.label).toBe('fake');
    expect(result.data?.audioSourceTracing?.label).toBe('elevenlabs');
  });

  it('returns verdict=false when image detection score exceeds threshold', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: {
              uuid: 'img-1',
              status: 'completed',
              media_type: 'image',
              image_metrics: { label: 'real', score: 0.85, type: 'facial' },
            },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: {
                uuid: 'img-1',
                status: 'completed',
                media_type: 'image',
                image_metrics: { label: 'real', score: 0.85, type: 'facial' },
              },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [
        { role: 'user', content: 'Real? https://cdn.example.com/photo.jpg' },
      ],
    });
    const result = await handler(
      context,
      baseParameters({ threshold: 0.5 }) as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(false);
    expect(result.data?.score).toBe(0.85);
  });

  it('times out polling when status never reaches completed', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: { uuid: 'slow-1', status: 'processing' },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: { uuid: 'slow-1', status: 'processing' },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [{ role: 'user', content: 'https://cdn.example.com/slow.mp3' }],
    });
    const result = await handler(
      context,
      baseParameters({ pollTimeoutMs: 50, pollIntervalMs: 10 }) as any,
      'beforeRequestHook'
    );
    // fail-open by default on timeout error
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(String(result.error.message || result.error)).toContain('timed out');
  });

  it('fails closed on HTTP error when failClosed=true', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: { ok: false, status: 401, body: { error: 'unauthorized' } },
      })
    );

    const context = makeContext({
      messages: [{ role: 'user', content: 'https://cdn.example.com/x.mp3' }],
    });
    const result = await handler(
      context,
      baseParameters({ failClosed: true }) as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data?.reason).toBe('http_error');
  });

  it('fails open on HTTP error by default', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: { ok: false, status: 500, body: { error: 'boom' } },
      })
    );

    const context = makeContext({
      messages: [{ role: 'user', content: 'https://cdn.example.com/x.mp3' }],
    });
    const result = await handler(
      context,
      baseParameters() as any,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
  });

  it('posts to the configured API base URL and bearer-authorizes', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: {
              uuid: 'ok-1',
              status: 'completed',
              metrics: {
                label: 'real',
                score: ['0.1'],
                aggregated_score: '0.1',
              },
            },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: {
                uuid: 'ok-1',
                status: 'completed',
                metrics: {
                  label: 'real',
                  score: ['0.1'],
                  aggregated_score: '0.1',
                },
              },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [{ role: 'user', content: 'https://cdn.example.com/x.mp3' }],
    });
    await handler(
      context,
      baseParameters({
        credentials: {
          apiKey: 'secret-xyz',
          apiBase: 'https://custom.example/api/v2',
        },
      }) as any,
      'beforeRequestHook'
    );

    const calls = fetchSpy.mock.calls as any[];
    expect(calls.length).toBeGreaterThan(0);
    const [firstUrl, firstInit] = calls[0];
    expect(firstUrl).toBe('https://custom.example/api/v2/detect');
    expect(firstInit.headers.Authorization).toBe('Bearer secret-xyz');
    const body = JSON.parse(firstInit.body);
    expect(body.url).toBe('https://cdn.example.com/x.mp3');
  });

  it('uses the default Resemble base URL when none is provided', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      mockFetch({
        create: {
          body: {
            success: true,
            item: {
              uuid: 'ok-2',
              status: 'completed',
              metrics: {
                label: 'real',
                score: ['0.1'],
                aggregated_score: '0.1',
              },
            },
          },
        },
        getSequence: [
          {
            body: {
              success: true,
              item: {
                uuid: 'ok-2',
                status: 'completed',
                metrics: {
                  label: 'real',
                  score: ['0.1'],
                  aggregated_score: '0.1',
                },
              },
            },
          },
        ],
      })
    );

    const context = makeContext({
      messages: [{ role: 'user', content: 'https://cdn.example.com/x.mp3' }],
    });
    await handler(context, baseParameters() as any, 'beforeRequestHook');

    const firstUrl = (fetchSpy.mock.calls as any[])[0][0];
    expect(firstUrl).toBe(`${RESEMBLE_DEFAULT_BASE_URL}/detect`);
  });
});
