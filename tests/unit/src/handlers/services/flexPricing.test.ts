import { Context } from 'hono';
import {
  LogsService,
  LogObjectBuilder,
} from '../../../../../src/handlers/services/logsService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { OpenAIChatCompleteJSONToStreamResponseTransform } from '../../../../../src/providers/openai/chatComplete';
import { OPEN_AI } from '../../../../../src/globals';

describe('Flex Pricing Support', () => {
  describe('LogObjectBuilder.addResponse - service_tier handling', () => {
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
        requestBody: { model: 'gpt-4o', messages: [] },
        index: 0,
        cacheConfig: { mode: 'simple', maxAge: 3600 },
      } as unknown as RequestContext;

      logObjectBuilder = new LogObjectBuilder(
        mockLogsService,
        mockRequestContext
      );
    });

    it('should capture service_tier: "flex" from response JSON', () => {
      const mockResponse = new Response('{}');
      const originalJson = {
        id: 'chatcmpl-123',
        choices: [],
        service_tier: 'flex',
      };

      logObjectBuilder.addResponse(mockResponse, originalJson);
      logObjectBuilder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceTier: 'flex',
        })
      );
    });

    it('should capture service_tier: "auto" (standard tier)', () => {
      const mockResponse = new Response('{}');
      const originalJson = {
        id: 'chatcmpl-123',
        choices: [],
        service_tier: 'auto',
      };

      logObjectBuilder.addResponse(mockResponse, originalJson);
      logObjectBuilder.log();

      expect(mockLogsService.addRequestLog).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceTier: 'auto',
        })
      );
    });

    it('should handle missing service_tier gracefully (undefined)', () => {
      const mockResponse = new Response('{}');
      const originalJson = {
        id: 'chatcmpl-123',
        choices: [],
      };

      logObjectBuilder.addResponse(mockResponse, originalJson);
      logObjectBuilder.log();

      const loggedData = (mockLogsService.addRequestLog as jest.Mock).mock
        .calls[0][0];
      // service_tier is not in the response, so serviceTier should not be set
      expect(loggedData.serviceTier).toBeUndefined();
    });

    it('should handle service_tier: null', () => {
      const mockResponse = new Response('{}');
      const originalJson = {
        id: 'chatcmpl-123',
        choices: [],
        service_tier: null,
      };

      logObjectBuilder.addResponse(mockResponse, originalJson);
      logObjectBuilder.log();

      const loggedData = (mockLogsService.addRequestLog as jest.Mock).mock
        .calls[0][0];
      // null is a defined value, so it should be captured
      expect(loggedData.serviceTier).toBeNull();
    });

    it('should preserve serviceTier through clone (via log())', () => {
      const mockResponse = new Response('{}');
      const originalJson = {
        id: 'chatcmpl-123',
        choices: [],
        service_tier: 'flex',
      };

      logObjectBuilder.addResponse(mockResponse, originalJson);
      logObjectBuilder.log();
      logObjectBuilder.log(); // log again to verify clone preserves serviceTier

      const firstLog = (mockLogsService.addRequestLog as jest.Mock).mock
        .calls[0][0];
      const secondLog = (mockLogsService.addRequestLog as jest.Mock).mock
        .calls[1][0];
      expect(firstLog.serviceTier).toBe('flex');
      expect(secondLog.serviceTier).toBe('flex');
    });
  });

  describe('LogsService.createLogObject - service_tier handling', () => {
    let mockContext: Context;
    let logsService: LogsService;
    let mockRequestContext: RequestContext;
    let mockResponse: Response;

    beforeEach(() => {
      mockContext = {
        get: jest.fn(),
        set: jest.fn(),
      } as unknown as Context;

      logsService = new LogsService(mockContext);

      mockRequestContext = {
        providerOption: { provider: 'openai' },
        requestURL: 'https://api.openai.com/v1/chat/completions',
        endpoint: 'chatComplete',
        transformedRequestBody: { model: 'gpt-4o', messages: [] },
        params: { model: 'gpt-4o', messages: [] },
        index: 0,
        cacheConfig: { mode: 'simple', maxAge: 3600 },
      } as unknown as RequestContext;

      mockResponse = new Response('{}', { status: 200 });
    });

    it('should capture service_tier: "flex" in createLogObject', async () => {
      const result = await logsService.createLogObject(
        mockRequestContext,
        {} as any,
        'hook-span',
        undefined,
        { headers: {} },
        undefined,
        mockResponse,
        { choices: [], service_tier: 'flex' }
      );

      expect(result.serviceTier).toBe('flex');
    });

    it('should set serviceTier to null when originalResponseJSON has no service_tier', async () => {
      const result = await logsService.createLogObject(
        mockRequestContext,
        {} as any,
        'hook-span',
        undefined,
        { headers: {} },
        undefined,
        mockResponse,
        { choices: [] }
      );

      expect(result.serviceTier).toBeNull();
    });

    it('should set serviceTier to null when originalResponseJSON is null', async () => {
      const result = await logsService.createLogObject(
        mockRequestContext,
        {} as any,
        'hook-span',
        undefined,
        { headers: {} },
        undefined,
        mockResponse,
        null
      );

      expect(result.serviceTier).toBeNull();
    });
  });

  describe('OpenAIChatCompleteJSONToStreamResponseTransform - service_tier in chunks', () => {
    const baseResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion' as const,
      created: 1234567890,
      model: 'gpt-4o',
      system_fingerprint: 'fp_abc',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Hello',
          },
          finish_reason: 'stop' as const,
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };

    it('should include service_tier in stream chunks when present', () => {
      const response = {
        ...baseResponse,
        service_tier: 'flex',
      };

      const chunks = OpenAIChatCompleteJSONToStreamResponseTransform(
        response as any,
        OPEN_AI
      );

      // Parse the first data chunk
      const firstDataChunk = chunks[0];
      const parsed = JSON.parse(firstDataChunk.replace('data: ', '').trim());
      expect(parsed.service_tier).toBe('flex');
    });

    it('should omit service_tier from stream chunks when not present', () => {
      const response = { ...baseResponse };

      const chunks = OpenAIChatCompleteJSONToStreamResponseTransform(
        response as any,
        OPEN_AI
      );

      const firstDataChunk = chunks[0];
      const parsed = JSON.parse(firstDataChunk.replace('data: ', '').trim());
      expect(parsed).not.toHaveProperty('service_tier');
    });

    it('should include service_tier: null in stream chunks when explicitly null', () => {
      const response = {
        ...baseResponse,
        service_tier: null,
      };

      const chunks = OpenAIChatCompleteJSONToStreamResponseTransform(
        response as any,
        OPEN_AI
      );

      const firstDataChunk = chunks[0];
      const parsed = JSON.parse(firstDataChunk.replace('data: ', '').trim());
      expect(parsed.service_tier).toBeNull();
    });

    it('should include service_tier: "auto" in stream chunks', () => {
      const response = {
        ...baseResponse,
        service_tier: 'auto',
      };

      const chunks = OpenAIChatCompleteJSONToStreamResponseTransform(
        response as any,
        OPEN_AI
      );

      const firstDataChunk = chunks[0];
      const parsed = JSON.parse(firstDataChunk.replace('data: ', '').trim());
      expect(parsed.service_tier).toBe('auto');
    });
  });
});
