import {
  buildWingbackWebhookBody,
  handler as wingbackHandler,
  resolveWingbackWebhookUrl,
  WINGBACK_DEFAULT_BASE_URL,
} from './scan';
import { PluginContext, PluginParameters } from '../types';
import { HttpError, TimeoutError } from '../utils';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

describe('wingback scan handler', () => {
  const chatContext: PluginContext = {
    request: {
      text: 'hello',
      json: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
    requestType: 'chatComplete',
  };

  const credentials = { apiKey: 'wb-integration-key' };

  beforeEach(() => {
    mockPost.mockReset();
  });

  it('resolveWingbackWebhookUrl uses production default', () => {
    expect(resolveWingbackWebhookUrl(credentials)).toBe(
      `${WINGBACK_DEFAULT_BASE_URL}/connectors/integrations/portkey/guardrail-webhook`
    );
  });

  it('resolveWingbackWebhookUrl trims trailing slash on baseUrl', () => {
    expect(
      resolveWingbackWebhookUrl({
        apiKey: 'k',
        baseUrl: 'https://api.wingback.io/',
      })
    ).toBe(
      'https://api.wingback.io/connectors/integrations/portkey/guardrail-webhook'
    );
  });

  it('buildWingbackWebhookBody strips request headers and sets eventType', () => {
    const context = {
      ...chatContext,
      request: {
        ...chatContext.request,
        headers: { authorization: 'secret' },
      },
      metadata: { model: 'gpt-4o-mini' },
    } as PluginContext;

    const body = buildWingbackWebhookBody(context, 'beforeRequestHook', {
      wingback_agent_id: 'agent-1',
    });

    expect(body.eventType).toBe('beforeRequestHook');
    expect((body.request as { headers?: unknown }).headers).toBeUndefined();
    expect(body.metadata).toEqual({
      model: 'gpt-4o-mini',
      wingback_agent_id: 'agent-1',
    });
  });

  it('passes allow verdict from Wingback', async () => {
    mockPost.mockResolvedValue({
      verdict: true,
      data: { wingback: { findings: [] } },
    });

    const result = await wingbackHandler(
      chatContext,
      { credentials, timeout: 2500 },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledWith(
      `${WINGBACK_DEFAULT_BASE_URL}/connectors/integrations/portkey/guardrail-webhook`,
      expect.objectContaining({ eventType: 'beforeRequestHook' }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer wb-integration-key' },
      }),
      2500
    );
  });

  it('passes block verdict from Wingback', async () => {
    mockPost.mockResolvedValue({
      verdict: false,
      data: { wingback: { block_reason: 'pii' } },
    });

    const result = await wingbackHandler(
      chatContext,
      { credentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data?.verdict).toBe(false);
  });

  it('applies transformedData on input mask', async () => {
    mockPost.mockResolvedValue({
      verdict: true,
      transformedData: {
        request: {
          json: {
            messages: [{ role: 'user', content: '[EMAIL]' }],
          },
        },
      },
    });

    const result = await wingbackHandler(
      chatContext,
      { credentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      '[EMAIL]'
    );
  });

  it('fails open on HTTP errors', async () => {
    mockPost.mockRejectedValue(
      new HttpError('HTTP error! status: 503', {
        status: 503,
        statusText: 'Service Unavailable',
        body: '{"detail":"busy"}',
        headers: new Headers({ 'content-type': 'application/json' }),
      })
    );

    const result = await wingbackHandler(
      chatContext,
      { credentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data?.failOpen).toBe(true);
  });

  it('fails open on timeout', async () => {
    mockPost.mockRejectedValue(
      new TimeoutError('timed out', 'https://example.com', 2500, 'POST')
    );

    const result = await wingbackHandler(
      chatContext,
      { credentials },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data?.timedOut).toBe(true);
  });

  it('requires integration api key', async () => {
    const result = await wingbackHandler(
      chatContext,
      { credentials: {} } as PluginParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(mockPost).not.toHaveBeenCalled();
  });
});
