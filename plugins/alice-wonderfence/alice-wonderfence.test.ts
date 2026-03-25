import { handler } from './evaluateContent';
import { HookEventType, PluginContext, PluginParameters } from '../types';

// Mock the @alice-io/wonderfence-ts-sdk
jest.mock('@alice-io/wonderfence-ts-sdk', () => {
  const Actions = {
    BLOCK: 'BLOCK',
    DETECT: 'DETECT',
    MASK: 'MASK',
    NO_ACTION: '',
  };

  class ConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConfigurationError';
    }
  }

  const mockEvaluatePrompt = jest.fn();
  const mockEvaluateResponse = jest.fn();

  const WonderFenceClient = jest.fn().mockImplementation((config: any) => {
    if (!config?.apiKey) {
      throw new ConfigurationError(
        'API key is required. Set ALICE_API_KEY environment variable or pass apiKey parameter.'
      );
    }
    return {
      evaluatePrompt: mockEvaluatePrompt,
      evaluateResponse: mockEvaluateResponse,
    };
  });

  return {
    WonderFenceClient,
    Actions,
    ConfigurationError,
    __mockEvaluatePrompt: mockEvaluatePrompt,
    __mockEvaluateResponse: mockEvaluateResponse,
  };
});

const {
  __mockEvaluatePrompt: mockEvaluatePrompt,
  __mockEvaluateResponse: mockEvaluateResponse,
} = jest.requireMock('@alice-io/wonderfence-ts-sdk');

const baseContext: PluginContext = {
  requestType: 'chatComplete',
  provider: 'openai',
  metadata: { session_id: 'sess-123', user_id: 'user-456' },
  request: {
    headers: { 'x-portkey-trace-id': 'trace-789' },
    json: {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
    },
  },
  response: {
    json: {
      choices: [{ message: { content: 'I am fine, thank you!' } }],
    },
  },
};

const baseParameters: PluginParameters = {
  credentials: {
    apiKey: 'test-api-key',
    appName: 'test-app',
  },
};

describe('alice-wonderfence evaluateContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BLOCK action', () => {
    it('should return verdict false for beforeRequestHook', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: 'BLOCK',
        correlationId: 'corr-1',
        detections: [{ type: 'harmful_content', score: 0.95 }],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.transformed).toBe(false);
      expect(result.data.action).toBe('BLOCK');
      expect(result.data.correlationId).toBe('corr-1');
      expect(result.data.detections).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return verdict false for afterRequestHook', async () => {
      mockEvaluateResponse.mockResolvedValue({
        action: 'BLOCK',
        correlationId: 'corr-2',
        detections: [{ type: 'toxic_content', score: 0.9 }],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'afterRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.transformed).toBe(false);
      expect(result.data.action).toBe('BLOCK');
    });
  });

  describe('MASK action', () => {
    it('should return verdict true with transformed content for beforeRequestHook', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: 'MASK',
        actionText: '[CONTENT MASKED]',
        correlationId: 'corr-3',
        detections: [{ type: 'pii', score: 0.88 }],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(true);
      expect(result.data.action).toBe('MASK');
      expect(result.error).toBeNull();
      // Verify the transformedData was populated via setCurrentContentPart
      expect(result.transformedData.request.json).not.toBeNull();
    });

    it('should replace response content with actionText for afterRequestHook', async () => {
      mockEvaluateResponse.mockResolvedValue({
        action: 'MASK',
        actionText: '[PII REDACTED]',
        correlationId: 'corr-4',
        detections: [{ type: 'pii', score: 0.92 }],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'afterRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(true);
      expect(result.data.action).toBe('MASK');
      expect(result.transformedData.response.json).not.toBeNull();
    });
  });

  describe('DETECT action', () => {
    it('should return verdict true with detections in data', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: 'DETECT',
        correlationId: 'corr-5',
        detections: [
          { type: 'prompt_injection', score: 0.6 },
          { type: 'harmful_content', score: 0.3 },
        ],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(false);
      expect(result.data.action).toBe('DETECT');
      expect(result.data.detections).toHaveLength(2);
      expect(result.error).toBeNull();
    });
  });

  describe('NO_ACTION', () => {
    it('should not include textExcerpt in data when debug is off', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-excerpt',
        detections: [],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.data).not.toHaveProperty('textExcerpt');
    });

    it('should include textExcerpt in data when debug is true', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-excerpt-debug',
        detections: [],
        errors: [],
      });

      const result = await handler(
        baseContext,
        { ...baseParameters, debug: true },
        'beforeRequestHook',
        undefined
      );

      expect(result.data.textExcerpt).toBeDefined();
    });

    it('should return verdict true with clean pass', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-6',
        detections: [],
        errors: [],
      });

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.transformed).toBe(false);
      expect(result.data.action).toBe('');
      expect(result.data.detections).toHaveLength(0);
      expect(result.error).toBeNull();
    });
  });

  describe('empty text', () => {
    it('should return early with error when request content is empty', async () => {
      const emptyContext: PluginContext = {
        ...baseContext,
        request: {
          headers: {},
          json: {
            model: 'gpt-4o',
            messages: [{ role: 'user', content: '' }],
          },
        },
      };

      const result = await handler(
        emptyContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toEqual({
        message: 'request or response content is empty',
      });
      expect(result.data).toBeNull();
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });
  });

  describe('fail-open behavior', () => {
    it('should return verdict true when credentials are missing', async () => {
      const result = await handler(
        baseContext,
        { credentials: {} },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('API key is required');
      expect(result.error).not.toHaveProperty('stack');
    });

    it('should return verdict true when apiKey is missing', async () => {
      const result = await handler(
        baseContext,
        { credentials: { appName: 'test' } },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('API key is required');
      expect(result.error).not.toHaveProperty('stack');
    });

    it('should return verdict true when no credentials provided at all', async () => {
      const result = await handler(
        baseContext,
        {},
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error).not.toHaveProperty('stack');
    });

    it('should return verdict true when SDK throws an error', async () => {
      mockEvaluatePrompt.mockRejectedValue(new Error('SDK connection error'));

      const result = await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toBeDefined();
      expect(result.error).not.toHaveProperty('stack');
      expect(result.data).toBeNull();
    });

    it('should return verdict true when failOpen is explicitly true', async () => {
      mockEvaluatePrompt.mockRejectedValue(new Error('SDK connection error'));

      const result = await handler(
        baseContext,
        { ...baseParameters, failOpen: true },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(result.error).toBeDefined();
    });

    it('should return verdict false when failOpen is false', async () => {
      mockEvaluatePrompt.mockRejectedValue(new Error('SDK connection error'));

      const result = await handler(
        baseContext,
        { ...baseParameters, failOpen: false },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toHaveProperty('stack');
      expect(result.data).toBeNull();
    });

    it('should return verdict false when failOpen is false and credentials are missing', async () => {
      const result = await handler(
        baseContext,
        { credentials: {}, failOpen: false },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('API key is required');
    });
  });

  describe('context extraction', () => {
    it('should pass analysisContext with metadata fields', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-7',
        detections: [],
        errors: [],
      });

      await handler(
        baseContext,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(mockEvaluatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-123',
          userId: 'user-456',
          provider: 'openai',
          modelName: 'gpt-4o',
        }),
        'Hello, how are you?',
        undefined,
        undefined
      );
    });

    it('should fallback session_id to trace-id when metadata.session_id is missing', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-8',
        detections: [],
        errors: [],
      });

      const contextWithoutSessionId = {
        ...baseContext,
        metadata: { user_id: 'user-456' },
      };

      await handler(
        contextWithoutSessionId,
        baseParameters,
        'beforeRequestHook',
        undefined
      );

      expect(mockEvaluatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'trace-789',
        }),
        'Hello, how are you?',
        undefined,
        undefined
      );
    });

    it('should call evaluateResponse for afterRequestHook', async () => {
      mockEvaluateResponse.mockResolvedValue({
        action: '',
        correlationId: 'corr-9',
        detections: [],
        errors: [],
      });

      await handler(baseContext, baseParameters, 'afterRequestHook', undefined);

      expect(mockEvaluateResponse).toHaveBeenCalled();
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });
  });
});
