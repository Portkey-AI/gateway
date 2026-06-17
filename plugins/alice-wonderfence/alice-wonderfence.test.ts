import { handler } from './evaluateContent';
import { HookEventType, PluginContext, PluginParameters } from '../types';

// Mock the @alice-io/wonderfence-ts-sdk (V2 client)
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

  const WonderFenceV2Client = jest.fn().mockImplementation((config: any) => {
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
    WonderFenceV2Client,
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

// A representative app_id UUID for tests.
const APP_ID = '11111111-1111-4111-8111-111111111111';

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
    appId: APP_ID,
  },
};

describe('alice-wonderfence evaluateContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Tests pin credentials explicitly; ensure an ambient env key never leaks
    // into the resolution path (it would mask the missing-apiKey case).
    delete process.env.ALICE_API_KEY;
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

  describe('misconfiguration (never fail-open)', () => {
    // The block reason must be carried in `data`, not `error`: the gateway
    // treats a check returning a truthy `error` as a pass (unless failOnError),
    // so a misconfig must return `error: null` + `verdict: false` to deny.
    it('should block (no error) when apiKey is missing, regardless of failOpen', async () => {
      const result = await handler(
        baseContext,
        { credentials: { appId: APP_ID } },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.error).toBeNull();
      expect(result.data.reason).toContain('apiKey is not configured');
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });

    it('should block (no error) when appId is missing, regardless of failOpen', async () => {
      const result = await handler(
        baseContext,
        { credentials: { apiKey: 'test-api-key' }, failOpen: true },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.error).toBeNull();
      expect(result.data.reason).toContain('appId is not configured');
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });

    it('should block (no error) when no credentials provided at all', async () => {
      const result = await handler(
        baseContext,
        {},
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(false);
      expect(result.error).toBeNull();
      expect(result.data.reason).toBeDefined();
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });
  });

  describe('fail-open behavior (runtime errors)', () => {
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
      // Fail-closed must NOT carry an `error` (gateway would treat it as a pass);
      // the reason lives in `data` and verdict false is what denies.
      expect(result.error).toBeNull();
      expect(result.data.reason).toContain('evaluation error');
    });
  });

  describe('credential resolution', () => {
    it('should not use request metadata appId when override is disabled (default)', async () => {
      const contextWithMetaAppId = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          alice_wonderfence_app_id: APP_ID,
        },
      };

      const result = await handler(
        contextWithMetaAppId,
        { credentials: { apiKey: 'test-api-key' } },
        'beforeRequestHook',
        undefined
      );

      // appId only in metadata + override off => misconfiguration => block
      expect(result.verdict).toBe(false);
      expect(result.error).toBeNull();
      expect(result.data.reason).toContain('appId is not configured');
      expect(mockEvaluatePrompt).not.toHaveBeenCalled();
    });

    it('should use request metadata appId when override is enabled', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-override',
        detections: [],
        errors: [],
      });

      const contextWithMetaAppId = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          alice_wonderfence_app_id: APP_ID,
        },
      };

      const result = await handler(
        contextWithMetaAppId,
        {
          credentials: { apiKey: 'test-api-key' },
          allowRequestMetadataOverride: true,
        },
        'beforeRequestHook',
        undefined
      );

      expect(result.verdict).toBe(true);
      expect(mockEvaluatePrompt).toHaveBeenCalledWith(
        APP_ID,
        expect.any(Object),
        'Hello, how are you?',
        undefined,
        undefined
      );
    });

    it('should prefer config appId over request metadata appId', async () => {
      mockEvaluatePrompt.mockResolvedValue({
        action: '',
        correlationId: 'corr-pref',
        detections: [],
        errors: [],
      });

      const otherAppId = '22222222-2222-4222-8222-222222222222';
      const contextWithMetaAppId = {
        ...baseContext,
        metadata: {
          ...baseContext.metadata,
          alice_wonderfence_app_id: otherAppId,
        },
      };

      await handler(
        contextWithMetaAppId,
        {
          credentials: { apiKey: 'test-api-key', appId: APP_ID },
          allowRequestMetadataOverride: true,
        },
        'beforeRequestHook',
        undefined
      );

      expect(mockEvaluatePrompt).toHaveBeenCalledWith(
        APP_ID,
        expect.any(Object),
        'Hello, how are you?',
        undefined,
        undefined
      );
    });
  });

  describe('context extraction', () => {
    it('should pass appId and analysisContext with metadata fields', async () => {
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
        APP_ID,
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
        APP_ID,
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
