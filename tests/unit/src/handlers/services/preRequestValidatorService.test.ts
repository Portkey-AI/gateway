import { Context } from 'hono';
import { PreRequestValidatorService } from '../../../../../src/handlers/services/preRequestValidatorService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';

describe('PreRequestValidatorService', () => {
  let mockContext: Context;
  let mockRequestContext: RequestContext;
  let preRequestValidatorService: PreRequestValidatorService;

  beforeEach(() => {
    mockContext = {
      get: jest.fn(),
    } as unknown as Context;

    mockRequestContext = {
      providerOption: { provider: 'openai' },
      requestHeaders: { authorization: 'Bearer sk-test' },
      params: { model: 'gpt-4', messages: [] },
    } as unknown as RequestContext;
  });

  describe('constructor', () => {
    it('should initialize with context and request context', () => {
      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );
      expect(preRequestValidatorService).toBeInstanceOf(
        PreRequestValidatorService
      );
      expect(mockContext.get).toHaveBeenCalledWith('preRequestValidator');
    });
  });

  describe('getResponse', () => {
    it('should return undefined when no validator is set', async () => {
      (mockContext.get as jest.Mock).mockReturnValue(undefined);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(result).toBeUndefined();
      expect(mockContext.get).toHaveBeenCalledWith('preRequestValidator');
    });

    it('should call validator with correct parameters when validator exists', async () => {
      const mockValidator = jest
        .fn()
        .mockResolvedValue(
          new Response('{"error": "Validation failed"}', { status: 400 })
        );
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(mockValidator).toHaveBeenCalledWith(
        mockContext,
        mockRequestContext.providerOption,
        mockRequestContext.requestHeaders,
        mockRequestContext.params
      );
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(400);
    });

    it('should return validator response when validation fails', async () => {
      const errorResponse = new Response(
        JSON.stringify({
          error: {
            message: 'Budget exceeded',
            type: 'budget_exceeded',
          },
        }),
        {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }
      );
      const mockValidator = jest.fn().mockResolvedValue(errorResponse);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(result).toBe(errorResponse);
      expect(result!.status).toBe(429);
    });

    it('should return undefined when validator passes (returns null)', async () => {
      const mockValidator = jest.fn().mockResolvedValue(null);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(mockValidator).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return undefined when validator passes (returns undefined)', async () => {
      const mockValidator = jest.fn().mockResolvedValue(undefined);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(mockValidator).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should handle validator that throws an error', async () => {
      const mockValidator = jest
        .fn()
        .mockRejectedValue(new Error('Validator error'));
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      await expect(preRequestValidatorService.getResponse()).rejects.toThrow(
        'Validator error'
      );
      expect(mockValidator).toHaveBeenCalledWith(
        mockContext,
        mockRequestContext.providerOption,
        mockRequestContext.requestHeaders,
        mockRequestContext.params
      );
    });

    it('should handle async validator correctly', async () => {
      const delayedResponse = new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response('{"status": "validated"}', { status: 200 }));
        }, 10);
      });
      const mockValidator = jest.fn().mockReturnValue(delayedResponse);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      preRequestValidatorService = new PreRequestValidatorService(
        mockContext,
        mockRequestContext
      );

      const result = await preRequestValidatorService.getResponse();

      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(200);
    });

    it('should pass correct parameters for different request contexts', async () => {
      const customRequestContext = {
        providerOption: {
          provider: 'anthropic',
          apiKey: 'sk-ant-test',
          customParam: 'value',
        },
        requestHeaders: {
          authorization: 'Bearer sk-ant-test',
          'anthropic-version': '2023-06-01',
        },
        params: {
          model: 'claude-3-sonnet',
          max_tokens: 1000,
          messages: [{ role: 'user', content: 'Hello' }],
        },
      } as unknown as RequestContext;

      const mockValidator = jest.fn().mockResolvedValue(undefined);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      const customService = new PreRequestValidatorService(
        mockContext,
        customRequestContext
      );

      await customService.getResponse();

      expect(mockValidator).toHaveBeenCalledWith(
        mockContext,
        customRequestContext.providerOption,
        customRequestContext.requestHeaders,
        customRequestContext.params
      );
    });

    it('should handle empty request parameters', async () => {
      const emptyRequestContext = {
        providerOption: {},
        requestHeaders: {},
        params: {},
      } as unknown as RequestContext;

      const mockValidator = jest.fn().mockResolvedValue(undefined);
      (mockContext.get as jest.Mock).mockReturnValue(mockValidator);

      const emptyService = new PreRequestValidatorService(
        mockContext,
        emptyRequestContext
      );

      await emptyService.getResponse();

      expect(mockValidator).toHaveBeenCalledWith(mockContext, {}, {}, {});
    });
  });
});
