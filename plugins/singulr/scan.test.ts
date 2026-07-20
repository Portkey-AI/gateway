import { handler as singulrScanHandler } from './scan';
import { HttpError, TimeoutError } from '../utils';
import { PluginContext } from '../types';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

function getCredentials(overrides: Record<string, unknown> = {}) {
  return {
    singulrApiKey: 'test-api-key',
    singulrBaseUrl: 'https://api.singulr.ai',
    ...overrides,
  };
}

function getParameters(overrides: Record<string, unknown> = {}) {
  return {
    credentials: getCredentials(),
    guardrailId: 'test-guardrail-id',
    applicationId: 'test-enforcement-id',
    ...overrides,
  };
}

const chatCompleteRequestContext = {
  request: {
    json: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello there' }],
    },
  },
  response: { json: null },
  provider: 'openai',
  requestType: 'chatComplete',
  metadata: {},
} as unknown as PluginContext;

const chatCompleteResponseContext = {
  request: {
    json: {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello there' }],
    },
  },
  response: {
    json: {
      choices: [{ message: { content: 'hi, how can I help?' } }],
    },
  },
  provider: 'openai',
  requestType: 'chatComplete',
  metadata: {},
} as unknown as PluginContext;

beforeEach(() => {
  mockPost.mockClear();
});

describe('singulr scan handler - credential validation', () => {
  it('errors when singulrApiKey is missing', async () => {
    const parameters = getParameters({
      credentials: { singulrBaseUrl: 'https://api.singulr.ai' },
    });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Missing required credentials: singulrApiKey and singulrBaseUrl are both required'
    );
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('errors when singulrBaseUrl is missing', async () => {
    const parameters = getParameters({
      credentials: { singulrApiKey: 'test-api-key' },
    });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Missing required credentials: singulrApiKey and singulrBaseUrl are both required'
    );
    expect(result.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('errors when neither guardrailId nor applicationId is present', async () => {
    const parameters = getParameters({
      guardrailId: undefined,
      applicationId: undefined,
    });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Missing required parameters: guardrailId and applicationId are both required'
    );
    expect(result.verdict).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('errors when only guardrailId is set', async () => {
    const parameters = getParameters({ applicationId: undefined });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Missing required parameters: guardrailId and applicationId are both required'
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('errors when only applicationId is set', async () => {
    const parameters = getParameters({ guardrailId: undefined });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Missing required parameters: guardrailId and applicationId are both required'
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('singulr scan handler - no content passthrough', () => {
  it('passes through when both request.json and response.json are absent', async () => {
    const context = {
      request: { json: null },
      response: { json: null },
      provider: 'openai',
      requestType: 'chatComplete',
      metadata: {},
    } as unknown as PluginContext;
    const parameters = getParameters();

    const result = await singulrScanHandler(
      context,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      explanation: 'No content to scan, passing through',
    });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('singulr scan handler - verdicts', () => {
  it('allows when should_block is false', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      explanation: 'Allowed by Singulr guardrail',
    });
  });

  it('blocks and surfaces the descriptive reason when should_block is true', async () => {
    mockPost.mockResolvedValue({
      should_block: true,
      blocking_due_to: 'PII Information detected',
    });
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      explanation: 'Blocked by Singulr guardrail: PII Information detected',
    });
  });

  it('scans the response payload for afterRequestHook', async () => {
    mockPost.mockResolvedValue({
      should_block: true,
      blocking_due_to: 'Toxic language detected',
    });
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteResponseContext,
      parameters,
      'afterRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      explanation: 'Blocked by Singulr guardrail: Toxic language detected',
    });
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        guard_input: (chatCompleteResponseContext.response as any).json,
        eventType: 'afterRequestHook',
      }),
      expect.any(Object),
      expect.any(Number)
    );
  });
});

describe('singulr scan handler - request body construction', () => {
  it('sends guard_input as the request json for beforeRequestHook', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();

    await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        provider: 'openai',
        guard_input: (chatCompleteRequestContext.request as any).json,
        guardrail_id: 'test-guardrail-id',
        enforcement_id: 'test-enforcement-id',
        eventType: 'beforeRequestHook',
      }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('includes metadata when user_id/model/user_name are present', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();
    const context = {
      ...chatCompleteRequestContext,
      metadata: { _user: 'user-123', _user_name: 'Jane Doe' },
    } as unknown as PluginContext;

    await singulrScanHandler(context, parameters, 'beforeRequestHook');

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: {
          user_id: 'user-123',
          model: 'gpt-4o-mini',
          extra_info: { user_name: 'Jane Doe' },
        },
      }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('omits metadata entirely when no user_id/model/user_name are present', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();
    const context = {
      request: { json: { messages: [{ role: 'user', content: 'hi' }] } },
      response: { json: null },
      provider: 'openai',
      requestType: 'chatComplete',
      metadata: {},
    } as unknown as PluginContext;

    await singulrScanHandler(context, parameters, 'beforeRequestHook');

    const sentBody = mockPost.mock.calls[0][1] as Record<string, unknown>;
    expect(sentBody.metadata).toBeUndefined();
  });

  it('falls back to user_id/user_name keys when _user/_user_name are absent', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();
    const context = {
      ...chatCompleteRequestContext,
      metadata: { user_id: 'fallback-user', user_name: 'Fallback Name' },
    } as unknown as PluginContext;

    await singulrScanHandler(context, parameters, 'beforeRequestHook');

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: {
          user_id: 'fallback-user',
          model: 'gpt-4o-mini',
          extra_info: { user_name: 'Fallback Name' },
        },
      }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('sends the gateway token and guardrail/enforcement headers', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();

    await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Singulr-Gateway-Token': 'test-api-key',
          'X-Singulr-Guardrail-Id': 'test-guardrail-id',
          'X-Singulr-Enforcement-Entity-Id': 'test-enforcement-id',
        }),
      }),
      expect.any(Number)
    );
  });

  it('uses the configured singulrBaseUrl credential', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters();

    await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.singulr.ai/api/v1/ai-gateway/portkey',
      expect.any(Object),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('strips a trailing slash from a custom singulrBaseUrl credential', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters({
      credentials: getCredentials({ singulrBaseUrl: 'http://localhost:8003/' }),
    });

    await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      'http://localhost:8003/api/v1/ai-gateway/portkey',
      expect.any(Object),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('uses the configured timeout when provided', async () => {
    mockPost.mockResolvedValue({ should_block: false, blocking_due_to: '' });
    const parameters = getParameters({ timeout: 1234 });

    await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      1234
    );
  });
});

describe('singulr scan handler - error handling', () => {
  it('reports a friendly message on 401 responses', async () => {
    mockPost.mockRejectedValue(
      new HttpError('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
        body: 'invalid token',
      })
    );
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toContain('Authentication failed (401)');
  });

  it('reports a friendly message on 403 responses', async () => {
    mockPost.mockRejectedValue(
      new HttpError('Forbidden', {
        status: 403,
        statusText: 'Forbidden',
        body: 'forbidden',
      })
    );
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toContain('Authentication failed (403)');
  });

  it('reports a service-unavailable message on 5xx responses', async () => {
    mockPost.mockRejectedValue(
      new HttpError('Internal Server Error', {
        status: 503,
        statusText: 'Service Unavailable',
        body: 'down for maintenance',
      })
    );
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toContain('Service unavailable (503)');
  });

  it('reports the raw status and body for other HTTP errors', async () => {
    mockPost.mockRejectedValue(
      new HttpError('Bad Request', {
        status: 400,
        statusText: 'Bad Request',
        body: 'malformed payload',
      })
    );
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBe('HTTP 400 error: malformed payload');
  });

  it('reports a timeout message on TimeoutError', async () => {
    mockPost.mockRejectedValue(
      new TimeoutError('timed out', 'https://api.singulr.ai/scan', 5000, 'POST')
    );
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      'Request timeout after 5000ms: Singulr scan took too long'
    );
  });

  it('reports a timeout message using the configured timeout value', async () => {
    mockPost.mockRejectedValue(
      new TimeoutError('timed out', 'https://api.singulr.ai/scan', 1234, 'POST')
    );
    const parameters = getParameters({ timeout: 1234 });

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.error).toBe(
      'Request timeout after 1234ms: Singulr scan took too long'
    );
  });

  it('falls back to a generic message for unknown errors', async () => {
    mockPost.mockRejectedValue(new Error('something went wrong'));
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBe('something went wrong');
  });

  it('handles non-Error rejections', async () => {
    mockPost.mockRejectedValue('a plain string rejection');
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBe('Unknown error occurred during Singulr scan');
  });

  it('does not block (verdict stays true) even when the scan call errors', async () => {
    mockPost.mockRejectedValue(new Error('network down'));
    const parameters = getParameters();

    const result = await singulrScanHandler(
      chatCompleteRequestContext,
      parameters,
      'beforeRequestHook'
    );

    // Fail-open behavior: errors during the scan should not block traffic.
    expect(result.verdict).toBe(true);
  });
});
