// SPDX-License-Identifier: MIT
import { PluginContext } from '../types';
import { handler as piiGuardrailHandler } from './piiGuardrail';
import {
  handler as semanticCacheGuardHandler,
  resetSemanticCacheForTests,
  seedSemanticCache,
} from './semanticCacheGuard';

describe('silicium guardrail and semantic cache plugin', () => {
  beforeEach(() => {
    resetSemanticCacheForTests();
  });

  it('should block requests containing PII or API secrets when piiPolicy is block', async () => {
    const sampleToken = 'gh' + 'p_1234567890abcdefghijklmnopqrstuvwx';
    const promptText = `Contact ceo@example.com with token ${sampleToken}`;
    const context: PluginContext = {
      request: {
        text: promptText,
        json: {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: promptText,
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await piiGuardrailHandler(
      context,
      { piiPolicy: 'block' },
      'beforeRequestHook'
    );

    expect(result).toBeDefined();
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.transformed).toBe(false);
    expect(result.data?.action).toBe('BLOCK');
    expect(result.data?.categories).toContain('EMAIL');
    expect(result.data?.categories).toContain('GITHUB_PAT');
  });

  it('should mask PII in-place via transformedData without mutating original request when piiPolicy is mask', async () => {
    const context: PluginContext = {
      request: {
        text: 'Email ceo@example.com please',
        json: {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: 'Email ceo@example.com please',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const result = await piiGuardrailHandler(
      context,
      { piiPolicy: 'mask' },
      'beforeRequestHook'
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(JSON.stringify(result.transformedData.request.json)).toContain(
      '[SILICIUM_REDACTED_EMAIL]'
    );
    expect(JSON.stringify(context.request.json.messages)).toContain(
      'ceo@example.com'
    );
  });

  it('should isolate semantic cache hits per tenantScope', async () => {
    const context: PluginContext = {
      request: {
        text: 'What is the Silicium architecture milestone?',
        json: {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: 'What is the Silicium architecture milestone?',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };

    const missResult = await semanticCacheGuardHandler(
      context,
      {
        tenantScope: 'tenant-alpha',
        embedding: [1.0, 0.0, 0.0, 0.0],
        cacheDim: 4,
      },
      'beforeRequestHook'
    );
    expect(missResult.verdict).toBe(true);
    expect(missResult.data?.cacheHit).toBe(false);

    seedSemanticCache(
      [1.0, 0.0, 0.0, 0.0],
      { id: 'cached-resp-1' },
      'tenant-alpha',
      4
    );

    const hitResult = await semanticCacheGuardHandler(
      context,
      {
        tenantScope: 'tenant-alpha',
        embedding: [1.0, 0.0, 0.0, 0.0],
        cacheDim: 4,
      },
      'beforeRequestHook'
    );
    expect(hitResult.verdict).toBe(true);
    expect(hitResult.data?.cacheHit).toBe(true);

    const otherTenantResult = await semanticCacheGuardHandler(
      context,
      {
        tenantScope: 'tenant-beta',
        embedding: [1.0, 0.0, 0.0, 0.0],
        cacheDim: 4,
      },
      'beforeRequestHook'
    );
    expect(otherTenantResult.verdict).toBe(true);
    expect(otherTenantResult.data?.cacheHit).toBe(false);
  });

  it('should enforce Luhn Mod-10 checksum on CREDIT_CARD_LUHN and ignore non-Luhn numeric IDs', async () => {
    const validLuhnContext: PluginContext = {
      request: {
        text: 'Card 4532015112830366',
        json: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Card 4532015112830366' }],
        },
      },
      requestType: 'chatComplete',
    };
    const validRes = await piiGuardrailHandler(
      validLuhnContext,
      { piiPolicy: 'mask' },
      'beforeRequestHook'
    );
    expect(validRes.verdict).toBe(true);
    expect(validRes.transformed).toBe(true);
    expect(validRes.data?.categories).toContain('CREDIT_CARD_LUHN');
    expect(JSON.stringify(validRes.transformedData.request.json)).toContain(
      '[SILICIUM_REDACTED_PII]'
    );

    const nonLuhnContext: PluginContext = {
      request: {
        text: 'Order ID 1234567890123456',
        json: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Order ID 1234567890123456' }],
        },
      },
      requestType: 'chatComplete',
    };
    const nonLuhnRes = await piiGuardrailHandler(
      nonLuhnContext,
      { piiPolicy: 'block' },
      'beforeRequestHook'
    );
    expect(nonLuhnRes.verdict).toBe(true);
    expect(nonLuhnRes.transformed).toBe(false);
    expect(nonLuhnRes.data?.piiFlags).toBe(0);
  });
});
