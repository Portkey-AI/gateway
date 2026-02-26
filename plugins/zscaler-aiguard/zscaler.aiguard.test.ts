import { handler as zscalerAIGuardHandler } from './intercept';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

describe('Zscaler AI Guard Guardrail', () => {
  const mockContext = {
    request: { text: 'This is a test prompt.' },
    response: { text: 'This is a test response.' },
  };

  const params = {
    credentials: { AIGUARD_API_KEY: 'dummy-key' },
    cloud: 'us1',
  };

  beforeEach(() => {
    mockPost.mockClear();
  });

  it('should return a result object with verdict, data, and error', async () => {
    mockPost.mockResolvedValue({ action: 'ALLOW', severity: 'LOW' });

    const result = await zscalerAIGuardHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('should allow when AI Guard returns action=ALLOW', async () => {
    mockPost.mockResolvedValue({
      action: 'ALLOW',
      severity: 'LOW',
      direction: 'IN',
      policyName: 'TestPolicy',
      detectorResponses: {},
    });

    const result = await zscalerAIGuardHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data.action).toBe('ALLOW');
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should block when AI Guard returns action=BLOCK', async () => {
    mockPost.mockResolvedValue({
      action: 'BLOCK',
      severity: 'CRITICAL',
      direction: 'IN',
      policyName: 'TestPolicy',
      detectorResponses: {
        pii: { triggered: true, action: 'BLOCK' },
      },
    });

    const result = await zscalerAIGuardHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data.action).toBe('BLOCK');
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should call the correct API URL based on cloud region', async () => {
    mockPost.mockResolvedValue({ action: 'ALLOW' });

    const eu1Params = {
      credentials: { AIGUARD_API_KEY: 'dummy-key' },
      cloud: 'eu1',
    };

    await zscalerAIGuardHandler(mockContext, eu1Params, 'beforeRequestHook');

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.eu1.zseclipse.net/v1/detection/resolve-and-execute-policy',
      expect.any(Object),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('should default to us1 cloud when not specified', async () => {
    mockPost.mockResolvedValue({ action: 'ALLOW' });

    const paramsNoCloud = {
      credentials: { AIGUARD_API_KEY: 'dummy-key' },
    };

    await zscalerAIGuardHandler(
      mockContext,
      paramsNoCloud,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      'https://api.us1.zseclipse.net/v1/detection/resolve-and-execute-policy',
      expect.any(Object),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('should send direction=IN for beforeRequestHook', async () => {
    mockPost.mockResolvedValue({ action: 'ALLOW' });

    await zscalerAIGuardHandler(mockContext, params, 'beforeRequestHook');

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ direction: 'IN' }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('should send direction=OUT for afterRequestHook', async () => {
    mockPost.mockResolvedValue({ action: 'ALLOW' });

    await zscalerAIGuardHandler(mockContext, params, 'afterRequestHook');

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ direction: 'OUT' }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('should use x-portkey-trace-id as transaction_id when available', async () => {
    const traceId = '38d838c3-2151-4f40-9729-9607f34ea446';
    const mockContextWithTraceId = {
      request: {
        text: 'Test prompt.',
        headers: { 'x-portkey-trace-id': traceId },
      },
      response: { text: 'Test response.' },
    };

    mockPost.mockResolvedValue({ action: 'ALLOW' });

    await zscalerAIGuardHandler(
      mockContextWithTraceId,
      params,
      'beforeRequestHook'
    );

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ transaction_id: traceId }),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it('should allow traffic when API key is missing (no HTTP call)', async () => {
    const originalEnvKey = process.env.AIGUARD_API_KEY;
    delete process.env.AIGUARD_API_KEY;

    const paramsWithoutKey = {
      ...params,
      credentials: {},
    };

    const result = await zscalerAIGuardHandler(
      mockContext,
      paramsWithoutKey,
      'beforeRequestHook'
    );

    if (originalEnvKey !== undefined) {
      process.env.AIGUARD_API_KEY = originalEnvKey;
    } else {
      delete process.env.AIGUARD_API_KEY;
    }

    expect(result.verdict).toBe(true);
    expect(result.error).toContain(
      'AIGUARD_API_KEY is required but not configured'
    );
    expect(result.data).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should allow traffic when API key is whitespace only (no HTTP call)', async () => {
    const originalEnvKey = process.env.AIGUARD_API_KEY;
    delete process.env.AIGUARD_API_KEY;

    const paramsWithEmptyKey = {
      ...params,
      credentials: { AIGUARD_API_KEY: '   ' },
    };

    const result = await zscalerAIGuardHandler(
      mockContext,
      paramsWithEmptyKey,
      'beforeRequestHook'
    );

    if (originalEnvKey !== undefined) {
      process.env.AIGUARD_API_KEY = originalEnvKey;
    } else {
      delete process.env.AIGUARD_API_KEY;
    }

    expect(result.verdict).toBe(true);
    expect(result.error).toContain(
      'AIGUARD_API_KEY is required but not configured'
    );
    expect(result.data).toBeNull();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('should handle malformed AI Guard response', async () => {
    mockPost.mockResolvedValue({ invalid: 'response' });

    const result = await zscalerAIGuardHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Malformed AI Guard response');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network timeout');
    mockPost.mockRejectedValue(networkError);

    const result = await zscalerAIGuardHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBe(networkError);
    expect(result.data).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
