import { handler as panwPrismaAirsHandler } from './intercept';

// Mock the utils module
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

describe('PANW Prisma AIRS Guardrail', () => {
  const mockContext = {
    request: { text: 'This is a test prompt.' },
    response: { text: 'This is a test response.' },
  };

  const params = {
    credentials: { AIRS_API_KEY: 'dummy-key' },
    profile_name: 'test-profile',
    ai_model: 'gpt-unit-test',
    app_user: 'unit-tester',
  };

  beforeEach(() => {
    mockPost.mockClear();
  });

  it('should return a result object with verdict, data, and error', async () => {
    mockPost.mockResolvedValue({ action: 'allow' });

    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('should work without profile_name (profile linked to API Key)', async () => {
    mockPost.mockResolvedValue({ action: 'allow' });

    const paramsWithoutProfile = {
      credentials: { AIRS_API_KEY: 'dummy-key' },
      ai_model: 'gpt-unit-test',
      app_user: 'unit-tester',
    };
    const result = await panwPrismaAirsHandler(
      mockContext,
      paramsWithoutProfile,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('should support profile_id parameter', async () => {
    mockPost.mockResolvedValue({ action: 'allow' });

    const paramsWithProfileId = {
      credentials: { AIRS_API_KEY: 'dummy-key' },
      profile_id: 'test-profile-id',
      ai_model: 'gpt-unit-test',
      app_user: 'unit-tester',
    };
    const result = await panwPrismaAirsHandler(
      mockContext,
      paramsWithProfileId,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('should support app_name parameter', async () => {
    mockPost.mockResolvedValue({ action: 'allow' });

    const paramsWithAppName = {
      credentials: { AIRS_API_KEY: 'dummy-key' },
      profile_name: 'test-profile',
      app_name: 'testapp',
      ai_model: 'gpt-unit-test',
      app_user: 'unit-tester',
    };
    const result = await panwPrismaAirsHandler(
      mockContext,
      paramsWithAppName,
      'beforeRequestHook'
    );
    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  // New behavioral tests
  it('should block when AIRS returns action=block', async () => {
    mockPost.mockResolvedValue({ action: 'block' });

    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({ action: 'block' });
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should allow when AIRS returns action=allow', async () => {
    mockPost.mockResolvedValue({ action: 'allow' });

    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({ action: 'allow' });
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should allow traffic when API key is missing (no HTTP call)', async () => {
    // Temporarily clear the environment variable
    const originalEnvKey = process.env.AIRS_API_KEY;
    delete process.env.AIRS_API_KEY;

    const paramsWithoutKey = {
      ...params,
      credentials: {},
    };

    const result = await panwPrismaAirsHandler(
      mockContext,
      paramsWithoutKey,
      'beforeRequestHook'
    );

    // Restore the environment variable to its exact original state
    if (originalEnvKey !== undefined) {
      process.env.AIRS_API_KEY = originalEnvKey;
    } else {
      delete process.env.AIRS_API_KEY;
    }

    expect(result.verdict).toBe(true);
    expect(result.error).toContain(
      'AIRS_API_KEY is required but not configured'
    );
    expect(result.data).toBeNull();
    expect(mockPost).not.toHaveBeenCalled(); // No HTTP call made
  });

  it('should allow traffic when API key is empty string (no HTTP call)', async () => {
    // Temporarily clear the environment variable
    const originalEnvKey = process.env.AIRS_API_KEY;
    delete process.env.AIRS_API_KEY;

    const paramsWithEmptyKey = {
      ...params,
      credentials: { AIRS_API_KEY: '   ' }, // whitespace only
    };

    const result = await panwPrismaAirsHandler(
      mockContext,
      paramsWithEmptyKey,
      'beforeRequestHook'
    );

    // Restore the environment variable to its exact original state
    if (originalEnvKey !== undefined) {
      process.env.AIRS_API_KEY = originalEnvKey;
    } else {
      delete process.env.AIRS_API_KEY;
    }

    expect(result.verdict).toBe(true);
    expect(result.error).toContain(
      'AIRS_API_KEY is required but not configured'
    );
    expect(result.data).toBeNull();
    expect(mockPost).not.toHaveBeenCalled(); // No HTTP call made
  });

  it('should handle malformed AIRS response', async () => {
    mockPost.mockResolvedValue({ invalid: 'response' }); // Missing 'action' field

    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Malformed AIRS response');
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network timeout');
    mockPost.mockRejectedValue(networkError);

    const result = await panwPrismaAirsHandler(
      mockContext,
      params,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBe(networkError);
    expect(result.data).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('should use x-portkey-trace-id as tr_id when available', async () => {
    const traceId = '38d838c3-2151-4f40-9729-9607f34ea446';
    const mockContextWithTraceId = {
      request: {
        text: 'This is a test prompt.',
        headers: { 'x-portkey-trace-id': traceId },
      },
      response: { text: 'This is a test response.' },
    };

    mockPost.mockResolvedValue({ action: 'allow' });

    await panwPrismaAirsHandler(
      mockContextWithTraceId,
      params,
      'beforeRequestHook'
    );

    // Verify the post call was made with the correct tr_id
    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tr_id: traceId,
      }),
      expect.any(Object)
    );
  });
});
