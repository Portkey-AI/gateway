import { Context } from 'hono';
import {
  LogsService,
  LogObjectBuilder,
} from '../../../../../src/handlers/services/logsService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { ProviderContext } from '../../../../../src/handlers/services/providerContext';
import { ToolCall } from '../../../../../src/types/requestBody';

describe('LogsService', () => {
  let mockContext: Context;
  let logsService: LogsService;

  beforeEach(() => {
    mockContext = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as Context;

    logsService = new LogsService(mockContext);
  });

  // Mock crypto for Node.js environment
  const mockCrypto = {
    randomUUID: jest.fn(() => 'mock-uuid-123'),
  };
  (global as any).crypto = mockCrypto;

  describe('createExecuteToolSpan', () => {
    const mockToolCall: ToolCall = {
      id: 'call_123',
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather',
        arguments: '{"location": "New York"}',
      },
    };

    const mockToolOutput = {
      temperature: '20°C',
      condition: 'sunny',
    };

    it('should create execute tool span with correct structure', () => {
      const startTime = 1000000000;
      const endTime = 1000001000;
      const traceId = 'trace-123';
      const parentSpanId = 'parent-456';
      const spanId = 'span-789';

      const result = logsService.createExecuteToolSpan(
        mockToolCall,
        mockToolOutput,
        startTime,
        endTime,
        traceId,
        parentSpanId,
        spanId
      );

      expect(result).toEqual({
        type: 'otlp_span',
        traceId: 'trace-123',
        spanId: 'span-789',
        parentSpanId: 'parent-456',
        name: 'execute_tool get_weather',
        kind: 'SPAN_KIND_INTERNAL',
        startTimeUnixNano: startTime,
        endTimeUnixNano: endTime,
        status: {
          code: 'STATUS_CODE_OK',
        },
        attributes: [
          {
            key: 'gen_ai.operation.name',
            value: { stringValue: 'execute_tool' },
          },
          {
            key: 'gen_ai.tool.name',
            value: { stringValue: 'get_weather' },
          },
          {
            key: 'gen_ai.tool.description',
            value: { stringValue: 'Get current weather' },
          },
        ],
        events: [
          {
            timeUnixNano: startTime,
            name: 'gen_ai.tool.input',
            attributes: [
              {
                key: 'location',
                value: { stringValue: 'New York' },
              },
            ],
          },
          {
            timeUnixNano: endTime,
            name: 'gen_ai.tool.output',
            attributes: [
              {
                key: 'temperature',
                value: { stringValue: '20°C' },
              },
              {
                key: 'condition',
                value: { stringValue: 'sunny' },
              },
            ],
          },
        ],
      });
    });

    it('should generate random span ID when not provided', () => {
      const result = logsService.createExecuteToolSpan(
        mockToolCall,
        mockToolOutput,
        1000,
        2000,
        'trace-123'
      );

      expect(result.spanId).toBe('mock-uuid-123');
      expect(mockCrypto.randomUUID).toHaveBeenCalled();
    });

    it('should handle undefined parent span ID', () => {
      const result = logsService.createExecuteToolSpan(
        mockToolCall,
        mockToolOutput,
        1000,
        2000,
        'trace-123'
      );

      expect(result.parentSpanId).toBeUndefined();
    });
  });

  describe('createLogObject', () => {
    let mockRequestContext: RequestContext;
    let mockProviderContext: ProviderContext;
    let mockResponse: Response;

    beforeEach(() => {
      mockRequestContext = {
        providerOption: { provider: 'openai' },
        requestURL: 'https://api.openai.com/v1/chat/completions',
        endpoint: 'chatComplete',
        transformedRequestBody: { model: 'gpt-4', messages: [] },
        params: { model: 'gpt-4', messages: [] },
        index: 0,
        cacheConfig: { mode: 'simple', maxAge: 3600 },
      } as unknown as RequestContext;

      mockProviderContext = {} as ProviderContext;

      mockResponse = new Response('{"choices": []}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    it('should create log object with all required fields', async () => {
      const hookSpanId = 'hook-span-123';
      const cacheKey = 'cache-key-456';
      const fetchOptions = {
        headers: { authorization: 'Bearer sk-test' },
      };
      const cacheStatus = 'MISS';
      const originalResponseJSON = { choices: [] };
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const executionTime = 1500;

      const result = await logsService.createLogObject(
        mockRequestContext,
        mockProviderContext,
        hookSpanId,
        cacheKey,
        fetchOptions,
        cacheStatus,
        mockResponse,
        originalResponseJSON,
        createdAt,
        executionTime
      );

      expect(result).toEqual({
        providerOptions: {
          provider: 'openai',
          requestURL: 'https://api.openai.com/v1/chat/completions',
          rubeusURL: 'chatComplete',
        },
        transformedRequest: {
          body: { model: 'gpt-4', messages: [] },
          headers: { authorization: 'Bearer sk-test' },
        },
        requestParams: { model: 'gpt-4', messages: [] },
        finalUntransformedRequest: {
          body: { model: 'gpt-4', messages: [] },
        },
        originalResponse: {
          body: { choices: [] },
        },
        createdAt,
        response: expect.any(Response),
        cacheStatus: 'MISS',
        lastUsedOptionIndex: 0,
        cacheKey: 'cache-key-456',
        cacheMode: 'simple',
        cacheMaxAge: 3600,
        hookSpanId: 'hook-span-123',
        executionTime: 1500,
      });
    });

    it('should use current date when createdAt not provided', async () => {
      const beforeCall = new Date();

      const result = await logsService.createLogObject(
        mockRequestContext,
        mockProviderContext,
        'hook-span-123',
        undefined,
        {},
        undefined,
        mockResponse,
        null
      );

      const afterCall = new Date();
      expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime()
      );
      expect(result.createdAt.getTime()).toBeLessThanOrEqual(
        afterCall.getTime()
      );
    });

    it('should handle undefined optional parameters', async () => {
      const result = await logsService.createLogObject(
        mockRequestContext,
        mockProviderContext,
        'hook-span-123',
        undefined,
        {},
        undefined,
        mockResponse,
        undefined
      );

      expect(result.cacheKey).toBeUndefined();
      expect(result.cacheStatus).toBeUndefined();
      expect(result.originalResponse.body).toBeUndefined();
      expect(result.executionTime).toBeUndefined();
    });
  });

  describe('requestLogs getter', () => {
    it('should return logs from context', () => {
      const mockLogs = [{ id: 'log1' }, { id: 'log2' }];
      (mockContext.get as jest.Mock).mockReturnValue(mockLogs);

      expect(logsService.requestLogs).toBe(mockLogs);
      expect(mockContext.get).toHaveBeenCalledWith('requestOptions');
    });

    it('should return empty array when no logs in context', () => {
      (mockContext.get as jest.Mock).mockReturnValue(undefined);

      expect(logsService.requestLogs).toEqual([]);
    });
  });

  describe('addRequestLog', () => {
    it('should add log to existing logs', () => {
      const existingLogs = [{ id: 'log1' }];
      const newLog = { id: 'log2' };
      (mockContext.get as jest.Mock).mockReturnValue(existingLogs);

      logsService.addRequestLog(newLog);

      expect(mockContext.set).toHaveBeenCalledWith('requestOptions', [
        { id: 'log1' },
        { id: 'log2' },
      ]);
    });

    it('should add log when no existing logs', () => {
      const newLog = { id: 'log1' };
      (mockContext.get as jest.Mock).mockReturnValue([]);

      logsService.addRequestLog(newLog);

      expect(mockContext.set).toHaveBeenCalledWith('requestOptions', [
        { id: 'log1' },
      ]);
    });
  });
});

describe('LogObjectBuilder', () => {
  let mockLogsService: LogsService;
  let mockRequestContext: RequestContext;
  let logObjectBuilder: LogObjectBuilder;

  beforeEach(() => {
    mockLogsService = {
      addRequestLog: jest.fn(),
    } as unknown as LogsService;

    mockRequestContext = {
      providerOption: { provider: 'openai' },
      requestURL: 'https://api.openai.com/v1/chat/completions',
      endpoint: 'chatComplete',
      requestBody: { model: 'gpt-4', messages: [] },
      index: 0,
      cacheConfig: { mode: 'simple', maxAge: 3600 },
    } as unknown as RequestContext;

    logObjectBuilder = new LogObjectBuilder(
      mockLogsService,
      mockRequestContext
    );
  });

  describe('constructor', () => {
    it('should initialize log data with request context', () => {
      const builder = new LogObjectBuilder(mockLogsService, mockRequestContext);

      // Test by calling log and checking the data passed to addRequestLog
      builder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: {
            provider: 'openai',
            requestURL: 'https://api.openai.com/v1/chat/completions',
            rubeusURL: 'chatComplete',
          },
          finalUntransformedRequest: {
            body: { model: 'gpt-4', messages: [] },
          },
          lastUsedOptionIndex: 0,
          cacheMode: 'simple',
          cacheMaxAge: 3600,
          createdAt: expect.any(Date),
        })
      );
    });
  });

  describe('updateRequestContext', () => {
    it('should update request context data', () => {
      const updatedContext = {
        ...mockRequestContext,
        index: 1,
        transformedRequestBody: { model: 'gpt-3.5-turbo', messages: [] },
        params: { model: 'gpt-3.5-turbo', messages: [] },
      } as unknown as RequestContext;
      const headers = { authorization: 'Bearer sk-test' };

      const result = logObjectBuilder.updateRequestContext(
        updatedContext,
        headers
      );

      expect(result).toBe(logObjectBuilder);

      // Verify data was updated by calling log
      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedOptionIndex: 1,
          transformedRequest: {
            body: { model: 'gpt-3.5-turbo', messages: [] },
            headers: { authorization: 'Bearer sk-test' },
          },
          requestParams: { model: 'gpt-3.5-turbo', messages: [] },
        })
      );
    });

    it('should handle undefined headers', () => {
      const result = logObjectBuilder.updateRequestContext(mockRequestContext);

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          transformedRequest: expect.objectContaining({
            headers: {},
          }),
        })
      );
    });
  });

  describe('addResponse', () => {
    it('should add response data', () => {
      const mockResponse = new Response('{"test": true}');
      const originalJson = { test: true };

      const result = logObjectBuilder.addResponse(mockResponse, originalJson);

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.any(Response),
          originalResponse: {
            body: { test: true },
          },
        })
      );
    });

    it('should handle null original response JSON', () => {
      const mockResponse = new Response('{}');

      logObjectBuilder.addResponse(mockResponse, null);
      logObjectBuilder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          originalResponse: {
            body: null,
          },
        })
      );
    });
  });

  describe('addExecutionTime', () => {
    it('should set creation time and calculate execution time', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const currentTime = Date.now();
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => currentTime);

      const result = logObjectBuilder.addExecutionTime(createdAt);

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt,
          executionTime: currentTime - createdAt.getTime(),
        })
      );

      Date.now = originalDateNow;
    });
  });

  describe('addTransformedRequest', () => {
    it('should add transformed request data', () => {
      const transformedBody = { model: 'claude-3', messages: [] };
      const transformedHeaders = { 'x-api-key': 'sk-ant-test' };

      const result = logObjectBuilder.addTransformedRequest(
        transformedBody,
        transformedHeaders
      );

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          transformedRequest: {
            body: transformedBody,
            headers: transformedHeaders,
          },
        })
      );
    });
  });

  describe('addCache', () => {
    it('should add cache data', () => {
      const result = logObjectBuilder.addCache('HIT', 'cache-key-123');

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheStatus: 'HIT',
          cacheKey: 'cache-key-123',
        })
      );
    });

    it('should handle undefined cache parameters', () => {
      const result = logObjectBuilder.addCache();

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheStatus: undefined,
          cacheKey: undefined,
        })
      );
    });
  });

  describe('addHookSpanId', () => {
    it('should add hook span ID', () => {
      const result = logObjectBuilder.addHookSpanId('hook-span-789');

      expect(result).toBe(logObjectBuilder);

      logObjectBuilder.log();
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          hookSpanId: 'hook-span-789',
        })
      );
    });
  });

  describe('log', () => {
    it('should call logsService.addRequestLog with log data', () => {
      // Set up minimum required data to pass validation
      logObjectBuilder
        .addTransformedRequest({}, {})
        .addResponse(new Response('{}'), {})
        .addHookSpanId('test-span-id');

      logObjectBuilder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledTimes(1);
      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: expect.any(Object),
          finalUntransformedRequest: expect.any(Object),
          createdAt: expect.any(Date),
        })
      );
    });

    it('should calculate execution time when createdAt is set', () => {
      const createdAt = new Date(Date.now() - 1000); // 1 second ago
      logObjectBuilder
        .addTransformedRequest({}, {})
        .addResponse(new Response('{}'), {})
        .addHookSpanId('test-span-id')
        .addExecutionTime(createdAt);

      logObjectBuilder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          executionTime: expect.any(Number),
        })
      );
    });

    it('should throw error when trying to log from committed object', () => {
      logObjectBuilder.commit();

      expect(() => logObjectBuilder.log()).toThrow(
        'Cannot log from a committed log object'
      );
    });

    it('should return self for method chaining', () => {
      logObjectBuilder
        .addTransformedRequest({}, {})
        .addResponse(new Response('{}'), {})
        .addHookSpanId('test-span-id');

      const result = logObjectBuilder.log();
      expect(result).toBe(logObjectBuilder);
    });
  });

  describe('commit', () => {
    it('should mark object as committed', () => {
      expect(logObjectBuilder.isDestroyed()).toBe(false);

      logObjectBuilder.commit();

      expect(logObjectBuilder.isDestroyed()).toBe(true);
    });

    it('should be safe to call multiple times', () => {
      logObjectBuilder.commit();
      logObjectBuilder.commit(); // Should not throw

      expect(logObjectBuilder.isDestroyed()).toBe(true);
    });
  });

  describe('isDestroyed', () => {
    it('should return false for new object', () => {
      expect(logObjectBuilder.isDestroyed()).toBe(false);
    });

    it('should return true after commit', () => {
      logObjectBuilder.commit();
      expect(logObjectBuilder.isDestroyed()).toBe(true);
    });
  });

  describe('Symbol.dispose', () => {
    it('should call commit when disposed', () => {
      const commitSpy = jest.spyOn(logObjectBuilder, 'commit');

      logObjectBuilder[Symbol.dispose]();

      expect(commitSpy).toHaveBeenCalled();
      expect(logObjectBuilder.isDestroyed()).toBe(true);
    });
  });
});
