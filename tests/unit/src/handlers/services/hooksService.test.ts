import { HooksService } from '../../../../../src/handlers/services/hooksService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { HooksManager, HookSpan } from '../../../../../src/middlewares/hooks';
import {
  HookType,
  AllHookResults,
  GuardrailResult,
  HookObject,
} from '../../../../../src/middlewares/hooks/types';

// Mock the HooksManager and HookSpan
jest.mock('../../../middlewares/hooks');

describe('HooksService', () => {
  let mockRequestContext: RequestContext;
  let mockHooksManager: jest.Mocked<HooksManager>;
  let mockHookSpan: jest.Mocked<HookSpan>;
  let hooksService: HooksService;

  beforeEach(() => {
    mockHookSpan = {
      id: 'span-123',
      getHooksResult: jest.fn(),
    } as unknown as jest.Mocked<HookSpan>;

    mockHooksManager = {
      createSpan: jest.fn().mockReturnValue(mockHookSpan),
      getHooksToExecute: jest.fn(),
    } as unknown as jest.Mocked<HooksManager>;

    mockRequestContext = {
      params: { message: 'test' },
      metadata: { userId: '123' },
      provider: 'openai',
      isStreaming: false,
      beforeRequestHooks: [],
      afterRequestHooks: [],
      endpoint: 'chatComplete',
      requestHeaders: {},
      hooksManager: mockHooksManager,
    } as unknown as RequestContext;

    hooksService = new HooksService(mockRequestContext);
  });

  describe('constructor', () => {
    it('should create hooks service and initialize span', () => {
      expect(mockHooksManager.createSpan).toHaveBeenCalledWith(
        mockRequestContext.params,
        mockRequestContext.metadata,
        mockRequestContext.provider,
        mockRequestContext.isStreaming,
        mockRequestContext.beforeRequestHooks,
        mockRequestContext.afterRequestHooks,
        null,
        mockRequestContext.endpoint,
        mockRequestContext.requestHeaders
      );
    });
  });

  describe('createSpan', () => {
    it('should create and return a new hook span', () => {
      const newMockSpan = { id: 'new-span-456' } as HookSpan;
      mockHooksManager.createSpan.mockReturnValue(newMockSpan);

      const result = hooksService.createSpan();

      expect(result).toBe(newMockSpan);
      expect(mockHooksManager.createSpan).toHaveBeenCalledTimes(2); // Once in constructor, once here
    });
  });

  describe('hookSpan getter', () => {
    it('should return the current hook span', () => {
      expect(hooksService.hookSpan).toBe(mockHookSpan);
    });
  });

  describe('results getter', () => {
    it('should return hook results from span', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'hook1', verdict: true } as GuardrailResult,
          { id: 'hook2', verdict: false } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'hook3', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.results).toBe(mockResults);
      expect(mockHookSpan.getHooksResult).toHaveBeenCalled();
    });

    it('should return undefined when no results', () => {
      mockHookSpan.getHooksResult.mockReturnValue(undefined as any);

      expect(hooksService.results).toBeUndefined();
    });
  });

  describe('areSyncHooksAvailable getter', () => {
    it('should return true when sync hooks are available', () => {
      mockHooksManager.getHooksToExecute.mockReturnValue([
        {
          id: 'hook1',
          type: HookType.GUARDRAIL,
          eventType: 'beforeRequestHook',
        } as HookObject,
        {
          id: 'hook2',
          type: HookType.MUTATOR,
          eventType: 'afterRequestHook',
        } as HookObject,
      ]);

      expect(hooksService.areSyncHooksAvailable).toBe(true);
      expect(mockHooksManager.getHooksToExecute).toHaveBeenCalledWith(
        mockHookSpan,
        ['syncBeforeRequestHook', 'syncAfterRequestHook']
      );
    });

    it('should return false when no sync hooks available', () => {
      mockHooksManager.getHooksToExecute.mockReturnValue([]);

      expect(hooksService.areSyncHooksAvailable).toBe(false);
    });

    it('should return false when hook span is not available', () => {
      hooksService = new HooksService({
        ...mockRequestContext,
        hooksManager: {
          ...mockHooksManager,
          createSpan: jest.fn().mockReturnValue(null),
        },
      } as unknown as RequestContext);

      expect(hooksService.areSyncHooksAvailable).toBe(false);
    });
  });

  describe('hasFailedHooks', () => {
    beforeEach(() => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: true } as GuardrailResult,
          { id: 'brh2', verdict: false } as GuardrailResult,
          { id: 'brh3', verdict: true } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: false } as GuardrailResult,
          { id: 'arh2', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);
    });

    it('should return true for beforeRequest when there are failed before request hooks', () => {
      expect(hooksService.hasFailedHooks('beforeRequest')).toBe(true);
    });

    it('should return true for afterRequest when there are failed after request hooks', () => {
      expect(hooksService.hasFailedHooks('afterRequest')).toBe(true);
    });

    it('should return true for any when there are failed hooks in either category', () => {
      expect(hooksService.hasFailedHooks('any')).toBe(true);
    });

    it('should return false for beforeRequest when all before request hooks pass', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: true } as GuardrailResult,
          { id: 'brh2', verdict: true } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: false } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasFailedHooks('beforeRequest')).toBe(false);
    });

    it('should return false for afterRequest when all after request hooks pass', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: false } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: true } as GuardrailResult,
          { id: 'arh2', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasFailedHooks('afterRequest')).toBe(false);
    });

    it('should return false for any when all hooks pass', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: true } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasFailedHooks('any')).toBe(false);
    });

    it('should handle empty hook results', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [],
        afterRequestHooksResult: [],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasFailedHooks('beforeRequest')).toBe(false);
      expect(hooksService.hasFailedHooks('afterRequest')).toBe(false);
      expect(hooksService.hasFailedHooks('any')).toBe(false);
    });

    it('should handle undefined hook results', () => {
      mockHookSpan.getHooksResult.mockReturnValue(undefined as any);

      expect(hooksService.hasFailedHooks('beforeRequest')).toBe(false);
      expect(hooksService.hasFailedHooks('afterRequest')).toBe(false);
      expect(hooksService.hasFailedHooks('any')).toBe(false);
    });
  });

  describe('hasResults', () => {
    beforeEach(() => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: true } as GuardrailResult,
          { id: 'brh2', verdict: false } as GuardrailResult,
        ],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);
    });

    it('should return true for beforeRequest when there are before request hook results', () => {
      expect(hooksService.hasResults('beforeRequest')).toBe(true);
    });

    it('should return true for afterRequest when there are after request hook results', () => {
      expect(hooksService.hasResults('afterRequest')).toBe(true);
    });

    it('should return true for any when there are results in either category', () => {
      expect(hooksService.hasResults('any')).toBe(true);
    });

    it('should return false for beforeRequest when no before request hook results', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [],
        afterRequestHooksResult: [
          { id: 'arh1', verdict: true } as GuardrailResult,
        ],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasResults('beforeRequest')).toBe(false);
    });

    it('should return false for afterRequest when no after request hook results', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [
          { id: 'brh1', verdict: true } as GuardrailResult,
        ],
        afterRequestHooksResult: [],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasResults('afterRequest')).toBe(false);
    });

    it('should return false for any when no results in either category', () => {
      const mockResults: AllHookResults = {
        beforeRequestHooksResult: [],
        afterRequestHooksResult: [],
      };
      mockHookSpan.getHooksResult.mockReturnValue(mockResults);

      expect(hooksService.hasResults('any')).toBe(false);
    });

    it('should handle undefined hook results', () => {
      mockHookSpan.getHooksResult.mockReturnValue(undefined as any);

      expect(hooksService.hasResults('beforeRequest')).toBe(false);
      expect(hooksService.hasResults('afterRequest')).toBe(false);
      expect(hooksService.hasResults('any')).toBe(false);
    });
  });
});
