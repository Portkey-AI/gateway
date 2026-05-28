import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  applyMasksToMessages,
  applyPayloadMasksToString,
  dedupePayloadItems,
  isOnlyPiiViolation,
  mergeOverlappingIntervals,
  normalizeSpan,
} from './redaction';
import { handler, resolveGuardUrl, extractScreeningMessages } from './guard';

global.fetch = jest.fn() as any;

const baseContext = {
  request: {
    json: { messages: [{ role: 'user', content: 'hello world' }] },
    text: 'hello world',
  },
  requestType: 'chatComplete' as const,
};

const baseParams = {
  credentials: { apiKey: 'test-api-key' },
};

function mockFetchResponse(body: object, ok = true) {
  (global.fetch as any).mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('lakera redaction helpers', () => {
  it('mergeOverlappingIntervals merges overlap and adjacent', () => {
    expect(
      mergeOverlappingIntervals([
        [0, 3],
        [2, 5],
      ])
    ).toEqual([[0, 5]]);
    expect(
      mergeOverlappingIntervals([
        [0, 2],
        [2, 4],
      ])
    ).toEqual([[0, 4]]);
    expect(
      mergeOverlappingIntervals([
        [0, 1],
        [5, 6],
      ])
    ).toEqual([
      [0, 1],
      [5, 6],
    ]);
  });

  it('dedupePayloadItems', () => {
    const items = [
      { message_id: 0, start: 1, end: 2, detector_type: 'pii/a' },
      { message_id: 0, start: 1, end: 2, detector_type: 'pii/a' },
    ];
    expect(dedupePayloadItems(items)).toHaveLength(1);
  });

  it('normalizeSpan half-open', () => {
    expect(normalizeSpan(0, 3, 10, false)).toEqual([0, 3]);
    expect(normalizeSpan(0, 11, 10, false)).toBeNull();
  });

  it('two non-overlapping spans', () => {
    const text = 'hello SECRET1 world SECRET2 end';
    const payload = [
      { message_id: 0, start: 6, end: 13, detector_type: 'pii/foo' },
      { message_id: 0, start: 20, end: 27, detector_type: 'pii/bar' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out).not.toContain('SECRET1');
    expect(out).not.toContain('SECRET2');
    expect(out).toContain('[MASKED_');
  });

  it('overlapping spans merged once', () => {
    const text = '0123456789';
    const payload = [
      { message_id: 0, start: 2, end: 5, detector_type: 'pii/a' },
      { message_id: 0, start: 4, end: 7, detector_type: 'pii/b' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out.split('[MASKED_').length - 1).toBe(1);
  });

  it('unicode emoji index', () => {
    const text = 'hi 👋 there';
    const i = text.indexOf('👋');
    const payload = [
      { message_id: 0, start: i, end: i + 1, detector_type: 'pii/x' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out).not.toContain('👋');
    expect(out).toContain('[MASKED_');
  });

  it('invalid span skipped', () => {
    const text = 'short';
    const payload = [
      { message_id: 0, start: 0, end: 99, detector_type: 'pii/x' },
    ];
    const { text: out, warnings } = applyPayloadMasksToString(
      text,
      payload,
      0,
      false
    );
    expect(out).toBe(text);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('message_id isolation', () => {
    const msgs = [
      { role: 'user', content: 'aaa' },
      { role: 'user', content: 'bbb' },
    ];
    const payload = [
      { message_id: 1, start: 0, end: 1, detector_type: 'pii/x' },
    ];
    const { messages: out } = applyMasksToMessages(msgs, payload, false);
    expect(out[0].content).toBe('aaa');
    expect(out[1].content).not.toBe('bbb');
  });

  it('isOnlyPiiViolation', () => {
    expect(isOnlyPiiViolation([])).toBe(false);
    expect(
      isOnlyPiiViolation([{ detected: true, detector_type: 'prompt_attack' }])
    ).toBe(false);
    expect(
      isOnlyPiiViolation([{ detected: true, detector_type: 'pii/email' }])
    ).toBe(true);
  });
});

describe('lakera guard handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns verdict=true when flagged=false', async () => {
    mockFetchResponse({ flagged: false, breakdown: [], payload: [] });
    const result = await handler(baseContext, baseParams, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBeFalsy();
  });

  it('returns verdict=false when non-PII policy fires', async () => {
    mockFetchResponse({
      flagged: true,
      breakdown: [{ detected: true, detector_type: 'prompt_attack' }],
      payload: [],
    });
    const result = await handler(baseContext, baseParams, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.transformed).toBeFalsy();
  });

  it('redacts and transforms when only pii/* detectors fire', async () => {
    const content = 'my email is test@example.com';
    const context = {
      request: {
        json: { messages: [{ role: 'user', content }] },
        text: content,
      },
      requestType: 'chatComplete' as const,
    };
    mockFetchResponse({
      flagged: true,
      breakdown: [{ detected: true, detector_type: 'pii/email' }],
      payload: [
        { message_id: 0, start: 12, end: 28, detector_type: 'pii/email' },
      ],
    });
    const result = await handler(context, baseParams, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content
    ).not.toContain('test@example.com');
  });

  it('returns error when apiKey is missing', async () => {
    const result = await handler(
      baseContext,
      { credentials: {} },
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns verdict=true with explanation when there is no text to screen', async () => {
    const emptyContext = {
      request: {
        json: { messages: [{ role: 'user', content: '' }] },
        text: '',
      },
      requestType: 'chatComplete' as const,
    };
    const result = await handler(emptyContext, baseParams, 'beforeRequestHook');
    expect(result.verdict).toBe(true);
    expect(result.data?.explanation).toBe('no messages to screen');
  });

  it('handles fetch errors gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('network failure'));
    const result = await handler(baseContext, baseParams, 'beforeRequestHook');
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('redacts PII in Anthropic messages format', async () => {
    mockFetchResponse({
      flagged: true,
      breakdown: [{ detected: true, detector_type: 'pii/email' }],
      payload: [
        { message_id: 1, start: 12, end: 28, detector_type: 'pii/email' },
      ],
    });
    const result = await handler(
      {
        requestType: 'messages',
        request: {
          json: {
            system: 'You are helpful.',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'my email is test@example.com' },
                ],
              },
            ],
          },
        },
      },
      baseParams,
      'beforeRequestHook'
    );
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).not.toContain('test@example.com');
  });

  it('sends full conversation history for Anthropic requests', async () => {
    mockFetchResponse({ flagged: false, breakdown: [], payload: [] });
    await handler(
      {
        requestType: 'messages',
        request: {
          json: {
            system: 'System prompt',
            messages: [
              { role: 'user', content: 'first turn' },
              { role: 'user', content: 'second turn' },
            ],
          },
        },
      },
      baseParams,
      'beforeRequestHook'
    );
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'System prompt',
    });
  });

  it('strips /v2/guard from apiBase when user pastes the full endpoint', async () => {
    mockFetchResponse({ flagged: false, breakdown: [], payload: [] });
    await handler(
      baseContext,
      {
        credentials: {
          apiKey: 'test-api-key',
          apiBase: 'https://api.lakera.ai/v2/guard',
        },
      },
      'beforeRequestHook'
    );
    expect((global.fetch as any).mock.calls[0][0]).toBe(
      'https://api.lakera.ai/v2/guard'
    );
  });
});

describe('lakera guard helpers', () => {
  it('resolveGuardUrl normalizes apiBase', () => {
    expect(resolveGuardUrl('https://api.lakera.ai/v2/guard')).toBe(
      'https://api.lakera.ai/v2/guard'
    );
    expect(resolveGuardUrl('api.lakera.ai')).toBe(
      'https://api.lakera.ai/v2/guard'
    );
  });

  it('extractScreeningMessages maps Anthropic system field', () => {
    const extracted = extractScreeningMessages(
      {
        requestType: 'messages',
        request: {
          json: {
            system: 'You are helpful.',
            messages: [{ role: 'user', content: 'Hi' }],
          },
        },
      },
      'beforeRequestHook'
    );
    expect(extracted?.messages[0]).toEqual({
      role: 'system',
      content: 'You are helpful.',
    });
  });
});
