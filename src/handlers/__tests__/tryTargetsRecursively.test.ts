import { Context } from 'hono';
import { tryTargetsRecursively, tryPost } from '../handlerUtils';
import { Options, StrategyModes, Targets } from '../../types/requestBody';
import { endpointStrings } from '../../providers/types';
import { HEADER_KEYS } from '../../globals';
import { GatewayError } from '../../errors/GatewayError';
import { RouterError } from '../../errors/RouterError';
import { ConditionalRouter } from '../../services/conditionalRouter';

// Mock the ConditionalRouter
jest.mock('../../services/conditionalRouter');
const MockedConditionalRouter = ConditionalRouter as jest.MockedClass<
  typeof ConditionalRouter
>;

// Mock tryPost function
jest.mock('../handlerUtils', () => ({
  ...jest.requireActual('../handlerUtils'),
  tryPost: jest.fn(),
}));
const mockedTryPost = tryPost as jest.MockedFunction<typeof tryPost>;

describe('tryTargetsRecursively Strategy Tests', () => {
  let mockContext: Context;
  let mockRequestHeaders: Record<string, string>;
  let mockRequestBody: any;
  let baseTarget: Options;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      get: jest.fn(),
      set: jest.fn(),
      req: { url: 'https://gateway.com/v1/chat/completions' },
    } as unknown as Context;

    mockRequestHeaders = {
      [HEADER_KEYS.CONTENT_TYPE]: 'application/json',
      authorization: 'Bearer sk-test123',
    };

    mockRequestBody = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    baseTarget = {
      provider: 'openai',
      apiKey: 'sk-test123',
    };
  });

  describe('SINGLE Strategy Mode', () => {
    it('should execute single target successfully', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [baseTarget],
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      const result = await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        baseTarget,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );

      expect(result).toBe(successResponse);
    });

    it('should throw error when single target fails', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [baseTarget],
        },
      ];

      const error = new Error('API Error');
      mockedTryPost.mockRejectedValue(error);

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toThrow('API Error');
    });
  });

  describe('FALLBACK Strategy Mode', () => {
    it('should try targets in sequence until success', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.FALLBACK },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' },
            { provider: 'anthropic', apiKey: 'sk-ant-test' },
            { provider: 'cohere', apiKey: 'co-test' },
          ],
        },
      ];

      const errorResponse1 = new Response('{"error": "Rate limited"}', {
        status: 429,
      });
      const errorResponse2 = new Response('{"error": "Server error"}', {
        status: 500,
      });
      const successResponse = new Response('{"choices": []}', { status: 200 });

      mockedTryPost
        .mockRejectedValueOnce(
          new GatewayError('Rate limited', 429, 'openai', errorResponse1)
        )
        .mockRejectedValueOnce(
          new GatewayError('Server error', 500, 'anthropic', errorResponse2)
        )
        .mockResolvedValueOnce(successResponse);

      const result = await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      // Verify all three providers were tried
      expect(mockedTryPost).toHaveBeenCalledTimes(3);
      expect(mockedTryPost).toHaveBeenNthCalledWith(
        1,
        mockContext,
        targets[0].targets[0],
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );
      expect(mockedTryPost).toHaveBeenNthCalledWith(
        2,
        mockContext,
        targets[0].targets[1],
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        1,
        'POST'
      );
      expect(mockedTryPost).toHaveBeenNthCalledWith(
        3,
        mockContext,
        targets[0].targets[2],
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        2,
        'POST'
      );

      expect(result).toBe(successResponse);
    });

    it('should stop fallback on non-retryable error', async () => {
      const targets: Targets[] = [
        {
          strategy: {
            mode: StrategyModes.FALLBACK,
            onStatusCodes: [500, 502], // Only retry on these codes
          },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' },
            { provider: 'anthropic', apiKey: 'sk-ant-test' },
          ],
        },
      ];

      const errorResponse = new Response('{"error": "Invalid API key"}', {
        status: 401,
      });
      mockedTryPost.mockRejectedValue(
        new GatewayError('Invalid API key', 401, 'openai', errorResponse)
      );

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toThrow('Invalid API key');

      // Should only try first provider (401 not in retry codes)
      expect(mockedTryPost).toHaveBeenCalledTimes(1);
    });

    it('should handle all targets failing', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.FALLBACK },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' },
            { provider: 'anthropic', apiKey: 'sk-ant-test' },
          ],
        },
      ];

      const error1 = new GatewayError(
        'Error 1',
        500,
        'openai',
        new Response('', { status: 500 })
      );
      const error2 = new GatewayError(
        'Error 2',
        500,
        'anthropic',
        new Response('', { status: 500 })
      );

      mockedTryPost.mockRejectedValueOnce(error1).mockRejectedValueOnce(error2);

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toThrow('Error 2'); // Should throw last error

      expect(mockedTryPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('LOADBALANCE Strategy Mode', () => {
    it('should select provider based on weights', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.LOADBALANCE },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1', weight: 0.7 },
            { provider: 'anthropic', apiKey: 'sk-ant-test', weight: 0.3 },
          ],
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      // Mock Math.random to return specific values
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.5); // Should select first provider (weight 0.7)

      const result = await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        targets[0].targets[0], // First provider should be selected
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );

      expect(result).toBe(successResponse);

      // Restore original Math.random
      Math.random = originalRandom;
    });

    it('should handle equal weights distribution', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.LOADBALANCE },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' }, // No weight = 1
            { provider: 'anthropic', apiKey: 'sk-ant-test' }, // No weight = 1
          ],
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      // Mock Math.random to return 0.6 (should select second provider)
      const originalRandom = Math.random;
      Math.random = jest.fn().mockReturnValue(0.6);

      await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        targets[0].targets[1], // Second provider should be selected
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        1,
        'POST'
      );

      Math.random = originalRandom;
    });
  });

  describe('CONDITIONAL Strategy Mode', () => {
    it('should route based on conditions', async () => {
      const mockRouterInstance = {
        getRoute: jest.fn().mockReturnValue('route1'),
      };
      MockedConditionalRouter.mockImplementation(
        () => mockRouterInstance as any
      );

      const targets: Targets[] = [
        {
          strategy: {
            mode: StrategyModes.CONDITIONAL,
            conditions: [{ query: { model: 'gpt-4' }, then: 'route1' }],
            default: 'route2',
          },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' },
            { provider: 'anthropic', apiKey: 'sk-ant-test' },
          ],
        },
      ];

      // Mock context metadata
      mockContext.get = jest.fn().mockImplementation((key) => {
        if (key === 'metadata') return { model: 'gpt-4' };
        return undefined;
      });

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      const result = await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      // Verify router was used
      expect(MockedConditionalRouter).toHaveBeenCalledWith(
        targets[0].strategy.conditions,
        targets[0].strategy.default
      );
      expect(mockRouterInstance.getRoute).toHaveBeenCalledWith({
        model: 'gpt-4',
      });

      expect(result).toBe(successResponse);
    });

    it('should handle router error', async () => {
      const mockRouterInstance = {
        getRoute: jest.fn().mockImplementation(() => {
          throw new RouterError('Invalid route');
        }),
      };
      MockedConditionalRouter.mockImplementation(
        () => mockRouterInstance as any
      );

      const targets: Targets[] = [
        {
          strategy: {
            mode: StrategyModes.CONDITIONAL,
            conditions: [{ query: { model: 'invalid' }, then: 'route1' }],
          },
          targets: [{ provider: 'openai', apiKey: 'sk-test1' }],
        },
      ];

      mockContext.get = jest.fn().mockReturnValue({ model: 'invalid' });

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toThrow(RouterError);
    });
  });

  describe('Configuration Inheritance', () => {
    it('should inherit retry configuration', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [
            {
              provider: 'openai',
              apiKey: 'sk-test123',
            },
          ],
          retry: { attempts: 3, onStatusCodes: [429, 500] },
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      // Verify inherited config was passed
      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          provider: 'openai',
          retry: { attempts: 3, onStatusCodes: [429, 500] },
        }),
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );
    });

    it('should inherit cache configuration', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [
            {
              provider: 'openai',
              apiKey: 'sk-test123',
            },
          ],
          cache: { mode: 'semantic', maxAge: 7200 },
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          cache: { mode: 'semantic', maxAge: 7200 },
        }),
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );
    });

    it('should merge override params', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [
            {
              provider: 'openai',
              apiKey: 'sk-test123',
              overrideParams: { temperature: 0.5 },
            },
          ],
          overrideParams: { maxTokens: 100, temperature: 0.8 }, // Should be overridden by target
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          overrideParams: {
            maxTokens: 100, // From targets config
            temperature: 0.5, // From target (should override)
          },
        }),
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );
    });

    it('should inherit hooks and guardrails', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [
            {
              provider: 'openai',
              apiKey: 'sk-test123',
              beforeRequestHooks: [{ id: 'target-hook' }],
            },
          ],
          beforeRequestHooks: [{ id: 'targets-hook' }],
          defaultInputGuardrails: [{ id: 'input-guard' }],
        },
      ];

      const successResponse = new Response('{"choices": []}', { status: 200 });
      mockedTryPost.mockResolvedValue(successResponse);

      await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          beforeRequestHooks: [{ id: 'targets-hook' }, { id: 'target-hook' }],
          defaultInputGuardrails: [{ id: 'input-guard' }],
        }),
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete',
        0,
        'POST'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle TypeError and convert to GatewayError', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [baseTarget],
        },
      ];

      const typeError = new TypeError('Network error');
      mockedTryPost.mockRejectedValue(typeError);

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toThrow(GatewayError);
    });

    it('should preserve GatewayError in fallback chain', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.FALLBACK },
          targets: [
            { provider: 'openai', apiKey: 'sk-test1' },
            { provider: 'anthropic', apiKey: 'sk-ant-test' },
          ],
        },
      ];

      const gatewayError = new GatewayError('Custom error', 500, 'openai');
      mockedTryPost.mockRejectedValue(gatewayError);

      await expect(
        tryTargetsRecursively(
          targets,
          0,
          mockContext,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          'POST'
        )
      ).rejects.toBe(gatewayError);
    });
  });

  describe('Multiple Targets Processing', () => {
    it('should process multiple target groups sequentially', async () => {
      const targets: Targets[] = [
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [{ provider: 'openai', apiKey: 'sk-test1' }],
        },
        {
          strategy: { mode: StrategyModes.SINGLE },
          targets: [{ provider: 'anthropic', apiKey: 'sk-ant-test' }],
        },
      ];

      const error = new GatewayError('First group failed', 500, 'openai');
      const successResponse = new Response('{"choices": []}', { status: 200 });

      mockedTryPost
        .mockRejectedValueOnce(error) // First target group fails
        .mockResolvedValueOnce(successResponse); // Second target group succeeds

      const result = await tryTargetsRecursively(
        targets,
        0,
        mockContext,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        'POST'
      );

      expect(mockedTryPost).toHaveBeenCalledTimes(2);
      expect(result).toBe(successResponse);
    });
  });
});
