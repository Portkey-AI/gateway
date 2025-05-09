import { handler as panwPrismaAirsHandler } from './intercept';
import { PluginContext, PluginParameters, HookEventType } from '../types';
import testCreds from './.creds.json';
import * as utils from '../utils';

// Mock the utils module
jest.mock('../utils');

const mockUtils = utils as jest.Mocked<typeof utils>;

describe('PANW Prisma AIRS Guardrail Unit Tests', () => {
  let mockContext: PluginContext;
  let mockParameters: PluginParameters;

  beforeEach(() => {
    // Reset mocks before each test
    mockUtils.getText.mockReset();
    mockUtils.post.mockReset();

    // Setup default mock context and parameters
    mockContext = {
      requestId: 'unit-test-req-id',
      credentials: { AIRS_API_KEY: testCreds.AIRS_API_KEY },
      request: { text: 'This is a test prompt.' },
      response: { text: 'This is a test response.' },
      // Add any other fields required by PluginContext and used by the handler
    };

    mockParameters = {
      profile_name: 'test-profile',
      ai_model: 'gpt-unit-test',
      app_user: 'unit-tester',
      timeout: 3000, // Example timeout
    };

    // Default mock for getText
    mockUtils.getText.mockImplementation(
      (ctx: PluginContext, hook: HookEventType) => {
        if (hook === 'beforeRequestHook') {
          return ctx.request?.text || '';
        }
        if (hook === 'afterRequestHook') {
          return ctx.response?.text || '';
        }
        return '';
      }
    );
  });

  test('should return verdict:true when AIRS action is not "block"', async () => {
    mockUtils.post.mockResolvedValue({
      action: 'allow',
      details: 'Content is fine',
    });

    const result = await panwPrismaAirsHandler(
      mockContext,
      mockParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data).toEqual({
      action: 'allow',
      details: 'Content is fine',
    });
    expect(result.error).toBeNull();
    expect(mockUtils.post).toHaveBeenCalledTimes(1);
    expect(mockUtils.getText).toHaveBeenCalledWith(
      mockContext,
      'beforeRequestHook'
    );
  });

  test('should return verdict:false when AIRS action is "block"', async () => {
    mockUtils.post.mockResolvedValue({
      action: 'block',
      reason: 'Malicious content',
    });

    const result = await panwPrismaAirsHandler(
      mockContext,
      mockParameters,
      'afterRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toEqual({
      action: 'block',
      reason: 'Malicious content',
    });
    expect(result.error).toBeNull();
    expect(mockUtils.getText).toHaveBeenCalledWith(
      mockContext,
      'afterRequestHook'
    );
  });

  test('should handle malformed AIRS response', async () => {
    mockUtils.post.mockResolvedValue({
      some_unexpected_field: 'nothing_useful',
    }); // No 'action' field

    const result = await panwPrismaAirsHandler(
      mockContext,
      mockParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).message).toBe('Malformed AIRS response');
  });

  test('should handle error from fetchAIRS (utils.post)', async () => {
    const apiError = new Error('AIRS API unavailable');
    mockUtils.post.mockRejectedValue(apiError);

    const result = await panwPrismaAirsHandler(
      mockContext,
      mockParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe(apiError);
  });

  test('should use default profile_name if not provided in parameters', async () => {
    mockUtils.post.mockResolvedValue({ action: 'allow' });
    const paramsWithoutProfile = { ...mockParameters };
    delete paramsWithoutProfile.profile_name;

    await panwPrismaAirsHandler(
      mockContext,
      paramsWithoutProfile,
      'beforeRequestHook'
    );

    expect(mockUtils.post).toHaveBeenCalledWith(
      expect.any(String), // AIRS_URL
      expect.objectContaining({
        ai_profile: { profile_name: 'dev-block-all-profile' }, // Default from intercept.ts
      }),
      expect.any(Object), // opts
      paramsWithoutProfile.timeout
    );
  });

  test('should use API key from process.env if not in credentials', async () => {
    process.env.AIRS_API_KEY = 'env-api-key-for-test';
    const contextWithoutCredKey = {
      ...mockContext,
      credentials: {}, // No AIRS_API_KEY here
    };
    mockUtils.post.mockResolvedValue({ action: 'allow' });

    await panwPrismaAirsHandler(
      contextWithoutCredKey,
      mockParameters,
      'beforeRequestHook'
    );

    expect(mockUtils.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: { 'x-pan-token': 'env-api-key-for-test' },
      }),
      mockParameters.timeout
    );
    delete process.env.AIRS_API_KEY; // Clean up env var
  });
});
