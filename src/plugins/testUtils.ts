import { PluginContext, PluginHandlerOptions } from './types';
import { setPluginHelpers } from './utils';

/**
 * Creates a mock PluginHandlerOptions object for use in tests.
 * Also configures the global plugin helpers for plugins that use `post()` directly.
 *
 * @param overrides - Optional partial overrides for the mock options
 * @returns A PluginHandlerOptions object with mocked functions
 *
 * @example
 * // Basic usage
 * const options = createMockPluginHandlerOptions();
 * await pluginHandler(context, parameters, eventType, options);
 *
 * @example
 * // With custom env
 * const options = createMockPluginHandlerOptions({ env: { MY_VAR: 'value' } });
 *
 * @example
 * // With custom cache behavior
 * const mockGetFromCache = jest.fn().mockResolvedValue({ cached: 'data' });
 * const options = createMockPluginHandlerOptions({ getFromCacheByKey: mockGetFromCache });
 */
export function createMockPluginHandlerOptions(
  overrides: Partial<PluginHandlerOptions> = {}
): PluginHandlerOptions {
  const options: PluginHandlerOptions = {
    env: overrides.env ?? {},
    getFromCacheByKey:
      overrides.getFromCacheByKey ?? jest.fn().mockResolvedValue(null),
    putInCacheWithValue:
      overrides.putInCacheWithValue ?? jest.fn().mockResolvedValue(null),
    internalServiceFetch: overrides.internalServiceFetch ?? fetch,
    externalServiceFetch: overrides.externalServiceFetch ?? fetch,
  };
  // Configure global plugin helpers for plugins that use post() directly
  setPluginHelpers(options);
  return options;
}

/**
 * Default mock PluginHandlerOptions for simple test cases.
 * Cache functions return null, fetch functions use actual fetch.
 *
 * Note: This is a getter that creates fresh options and sets up plugin helpers
 * each time it's accessed, ensuring the global state is properly configured.
 *
 * @example
 * await pluginHandler(context, parameters, eventType, mockPluginHandlerOptions);
 */
export const mockPluginHandlerOptions: PluginHandlerOptions =
  createMockPluginHandlerOptions();

/**
 * Creates a mock PluginContext for chatComplete response scenarios.
 * Use this for afterRequestHook tests that need to read response content.
 * Automatically populates both response.text and response.json.
 *
 * @param content - The text content for the response
 * @param overrides - Optional overrides for additional context properties
 *
 * @example
 * const context = createChatCompleteResponseContext('Hello world');
 * const result = await handler(context, params, 'afterRequestHook', options);
 */
export function createChatCompleteResponseContext(
  content: string,
  overrides: Partial<PluginContext> = {}
): PluginContext {
  return {
    requestType: 'chatComplete',
    response: {
      text: content,
      json: {
        choices: [
          {
            message: {
              role: 'assistant',
              content,
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

/**
 * Creates a mock PluginContext for chatComplete request scenarios.
 * Use this for beforeRequestHook tests that need to read request content.
 * Automatically populates both request.text and request.json.
 *
 * @param content - The text content for the user message
 * @param overrides - Optional overrides for additional context properties
 *
 * @example
 * const context = createChatCompleteRequestContext('What is AI?');
 * const result = await handler(context, params, 'beforeRequestHook', options);
 */
export function createChatCompleteRequestContext(
  content: string,
  overrides: Partial<PluginContext> = {}
): PluginContext {
  return {
    requestType: 'chatComplete',
    request: {
      text: content,
      json: {
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      },
    },
    ...overrides,
  };
}
