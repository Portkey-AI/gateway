import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { requestValidator } from './middlewares/requestValidator';

jest.mock('./utils/env', () => ({
  Environment: jest.fn((c) => c?.env ?? {}),
}));

describe('deprecated proxy route validation', () => {
  const nestedConfig = (depth: number): any =>
    depth === 0
      ? {
          provider: 'openai',
          api_key: 'sk-test',
          custom_host: 'http://10.0.0.1:9999/',
        }
      : {
          strategy: { mode: 'fallback' },
          targets: [nestedConfig(depth - 1)],
        };

  it('registers requestValidator before proxyHandler', () => {
    const source = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

    expect(source).toContain(
      "app.post('/v1/proxy/*', requestValidator, proxyHandler);"
    );
  });

  it('rejects an unsafe custom host before invoking the next handler', async () => {
    const nextHandler = jest.fn(() => new Response(null, { status: 204 }));
    const app = new Hono();
    app.post('/v1/proxy/*', requestValidator, nextHandler);

    const response = await app.request('/v1/proxy/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
        'x-portkey-custom-host': 'http://10.0.0.1:9999/',
        'x-portkey-provider': 'openai',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: 'failure',
      message: 'Invalid custom host',
    });
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'preserves Workerd trusted hosts at depth %i',
    async (depth) => {
      const nextHandler = jest.fn(() => new Response(null, { status: 204 }));
      const app = new Hono();
      app.post('/v1/proxy/*', requestValidator, nextHandler);

      const response = await app.request(
        '/v1/proxy/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: 'Bearer sk-test',
            'content-type': 'application/json',
            'x-portkey-config': JSON.stringify(nestedConfig(depth)),
          },
        },
        { TRUSTED_CUSTOM_HOSTS: '10.0.0.1' }
      );

      expect(response.status).toBe(204);
      expect(nextHandler).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, 1, 2])(
    'rejects untrusted config hosts at depth %i',
    async (depth) => {
      const nextHandler = jest.fn(() => new Response(null, { status: 204 }));
      const app = new Hono();
      app.post('/v1/proxy/*', requestValidator, nextHandler);

      const response = await app.request('/v1/proxy/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer sk-test',
          'content-type': 'application/json',
          'x-portkey-config': JSON.stringify(nestedConfig(depth)),
        },
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        status: 'failure',
        message: 'Invalid config passed',
        errors: expect.arrayContaining([
          expect.stringContaining('Invalid custom host'),
        ]),
      });
      expect(nextHandler).not.toHaveBeenCalled();
    }
  );
});
