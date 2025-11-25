import { handler as textGuardHandler } from './guard';
import { HookEventType, PluginContext } from '../types';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const options = {
  env: {
    ANOTHER_KEY: 'another-value',
  },
};

const mockCredentials = {
  v1Url: 'https://api.trendmicro.com/v1/scan',
  apiKey: 'jwt-token',
};

describe('TrendMicro textGuardHandler', () => {
  it('should return an error if v1Url is not provided', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      v1_api_key: 'jwt-token',
      applicationName: 'test-app',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error?.message).toBe(
      "'parameters.credentials.v1Url' must be set"
    );
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if apiKey is not provided', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
      },
      applicationName: 'test-app',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error?.message).toBe(
      "'parameters.credentials.apiKey' must be set"
    );
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if text is empty', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: '' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'jwt-token',
      },
      applicationName: 'test-app',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error?.message).toBe('request or response text is empty');
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if applicationName is not provided', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'jwt-token',
      },
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error?.message).toBe('Application name is required');
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should return an error if applicationName has invalid format', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'jwt-token',
      },
      applicationName: 'invalid app name with spaces',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error?.message).toBe(
      'Application name must contain only letters, numbers, hyphens, and underscores'
    );
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should handle HTTP errors gracefully', async () => {
    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://invalid-url-that-will-fail.com/v1/scan',
        apiKey: 'TRENDMICRO_API_KEY',
      },
      applicationName: 'test-app',
      timeout: 1000,
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error).toBeDefined();
    expect(typeof result.error?.message).toBe('string');
    expect(result.error?.message).toContain('fetch failed');
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should work with afterRequestHook event type', async () => {
    const context: PluginContext = {
      response: {
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'This is a response message',
              },
            },
          ],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'afterRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'TRENDMICRO_API_KEY',
      },
      applicationName: 'test-app',
    };

    // Since this will fail due to invalid URL, we just check that it processes the afterRequestHook
    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should use correct headers and request format', async () => {
    // Mock fetch to verify the request format
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        threat_detected: false,
        message: 'Text is clean',
      }),
    });

    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a clean test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'jwt-token',
      },
      applicationName: 'test-app',
    };

    await textGuardHandler(context, parameters, eventType, options);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.trendmicro.com/v1/scan',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
          'TMV1-Application-Name': 'test-app',
          Prefer: 'return=minimal',
        }),
        body: expect.stringContaining(
          '"prompt":"This is a clean test message"'
        ),
      })
    );

    // Restore original fetch
    global.fetch = originalFetch;
  });

  it('should return false verdict when threat is detected', async () => {
    // Mock fetch to simulate threat detection
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        action: 'Block',
        reason: 'Prompt Attack Detected',
      }),
    });

    const context: PluginContext = {
      request: {
        json: {
          messages: [
            { role: 'user', content: 'This is a malicious test message' },
          ],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'TRENDMICRO_API_KEY',
      },
      applicationName: 'test-app',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data).toBeDefined();

    // Restore original fetch
    global.fetch = originalFetch;
  });

  it('should return true verdict when no threat is detected', async () => {
    // Mock fetch to simulate clean text
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        threat_detected: false,
        message: 'Text is clean',
      }),
    });

    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a clean test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'TRENDMICRO_API_KEY',
      },
      applicationName: 'test-app',
    };

    const result = await textGuardHandler(
      context,
      parameters,
      eventType,
      options
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.threat_detected).toBe(false);

    // Restore original fetch
    global.fetch = originalFetch;
  });

  it('should use correct Prefer header when prefer parameter is set', async () => {
    // Mock fetch to verify the request format
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '1234567890abcdef',
        action: 'Allow',
        reasons: [],
      }),
    });

    const context: PluginContext = {
      request: {
        json: {
          messages: [{ role: 'user', content: 'This is a test message' }],
        },
      },
      requestType: 'chatComplete',
      logger: mockLogger,
    };
    const eventType: HookEventType = 'beforeRequestHook';
    const parameters = {
      credentials: {
        v1Url: 'https://api.trendmicro.com/v1/scan',
        apiKey: 'jwt-token',
      },
      applicationName: 'test-app',
      prefer: 'return=representation',
    };

    await textGuardHandler(context, parameters, eventType, options);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.trendmicro.com/v1/scan',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer jwt-token',
          'TMV1-Application-Name': 'test-app',
          Prefer: 'return=representation',
        }),
        body: expect.stringContaining('"prompt":"This is a test message"'),
      })
    );

    // Restore original fetch
    global.fetch = originalFetch;
  });
});
