/// <reference types="jest" />
import { handler } from './main-function';
import type { PluginContext, PluginParameters } from '../types';
import * as utils from '../utils';

jest.mock('../utils');

const mockedPost = utils.post as jest.Mock;
const mockedGetText = utils.getText as jest.Mock;

describe('Zscaler AI Guard Plugin - Unit Tests', () => {
  const baseParameters: PluginParameters<{ zscalerApiKey: string }> = {
    credentials: { zscalerApiKey: 'test-key' },
    parameters: { policyId: 'test-policy' },
  };

  const baseContext: PluginContext = {
    request: { json: {} },
    requestType: 'chatComplete',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetText.mockReturnValue('test content');
  });

  it('should fail open when API key is missing', async () => {
    const result = await handler(
      baseContext,
      { credentials: {}, parameters: { policyId: 'x' } } as any,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('should fail open when policyId is missing', async () => {
    const result = await handler(
      baseContext,
      { credentials: { zscalerApiKey: 'x' }, parameters: {} } as any,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('should return allow for ALLOW response', async () => {
    mockedPost.mockResolvedValue({
      action: 'ALLOW',
    });

    const result = await handler(
      baseContext,
      baseParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
  });

  it('should block when top-level action is BLOCK', async () => {
    mockedPost.mockResolvedValue({
      action: 'BLOCK',
    });

    const result = await handler(
      baseContext,
      baseParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
  });

  it('should block when detector returns BLOCK', async () => {
    mockedPost.mockResolvedValue({
      action: 'ALLOW',
      detectorResponses: {
        dlp: { action: 'BLOCK' },
      },
    });

    const result = await handler(
      baseContext,
      baseParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
  });

  it('should handle 429 rate limit error', async () => {
    mockedPost.mockRejectedValue({
      response: { status: 429 },
    });

    const result = await handler(
      baseContext,
      baseParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error?.message).toContain('rate limit');
  });

  it('should allow empty content', async () => {
    mockedGetText.mockReturnValue('');

    const result = await handler(
      baseContext,
      baseParameters,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
  });
});
