import { Hono } from 'hono';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { loadExternalMiddleware } from '../external';

describe('loadExternalMiddleware', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeMiddleware(name: string, code: string) {
    fs.writeFileSync(path.join(tmpDir, `${name}.js`), code);
  }

  it('loads middleware factories in config order', async () => {
    writeMiddleware(
      'first',
      `module.exports = function(config) {
        return async (c, next) => {
          c.set('order', (c.get('order') || '') + 'first,');
          await next();
        };
      }`
    );
    writeMiddleware(
      'second',
      `module.exports = function(config) {
        return async (c, next) => {
          c.set('order', (c.get('order') || '') + 'second,');
          await next();
        };
      }`
    );

    const app = new Hono();
    await loadExternalMiddleware(app, {
      middlewareDir: tmpDir,
      entries: [
        { name: 'first', config: {}, enabled: true },
        { name: 'second', config: {}, enabled: true },
      ],
    });

    let result = '';
    app.get('/test', (c: any) => {
      result = c.get('order') || '';
      return c.json({ ok: true });
    });

    await app.request('/test', { method: 'GET' });
    expect(result).toBe('first,second,');
  });

  it('passes config to factory', async () => {
    writeMiddleware(
      'configged',
      `module.exports = function(config) {
        return async (c, next) => {
          c.set('receivedConfig', config);
          await next();
        };
      }`
    );

    const app = new Hono();
    await loadExternalMiddleware(app, {
      middlewareDir: tmpDir,
      entries: [
        { name: 'configged', config: { windowSize: 8 }, enabled: true },
      ],
    });

    let receivedConfig: any;
    app.get('/test', (c: any) => {
      receivedConfig = c.get('receivedConfig');
      return c.json({ ok: true });
    });

    await app.request('/test', { method: 'GET' });
    expect(receivedConfig).toEqual({ windowSize: 8 });
  });

  it('throws on missing middleware file', async () => {
    const app = new Hono();
    await expect(
      loadExternalMiddleware(app, {
        middlewareDir: tmpDir,
        entries: [{ name: 'nonexistent', config: {}, enabled: true }],
      })
    ).rejects.toThrow("Middleware 'nonexistent' not found at");
  });

  it('throws when factory throws', async () => {
    writeMiddleware(
      'broken',
      `module.exports = function(config) {
        throw new Error('bad config');
      }`
    );

    const app = new Hono();
    await expect(
      loadExternalMiddleware(app, {
        middlewareDir: tmpDir,
        entries: [{ name: 'broken', config: {}, enabled: true }],
      })
    ).rejects.toThrow("Middleware 'broken' failed to initialize");
  });

  it('does nothing when entries is empty', async () => {
    const app = new Hono();
    await loadExternalMiddleware(app, {
      middlewareDir: tmpDir,
      entries: [],
    });
    app.get('/test', (c) => c.json({ ok: true }));
    const res = await app.request('/test', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('supports async factory functions', async () => {
    writeMiddleware(
      'async-init',
      `module.exports = async function(config) {
        await new Promise(resolve => setTimeout(resolve, 10));
        return async (c, next) => {
          c.set('async-init:ready', true);
          await next();
        };
      }`
    );

    const app = new Hono();
    await loadExternalMiddleware(app, {
      middlewareDir: tmpDir,
      entries: [{ name: 'async-init', config: {}, enabled: true }],
    });

    let ready: any;
    app.get('/test', (c: any) => {
      ready = c.get('async-init:ready');
      return c.json({ ok: true });
    });

    await app.request('/test', { method: 'GET' });
    expect(ready).toBe(true);
  });

  it('wraps middleware errors with middleware name', async () => {
    writeMiddleware(
      'exploder',
      `module.exports = function(config) {
        return async (c, next) => {
          throw new Error('boom');
        };
      }`
    );

    const app = new Hono();
    app.onError((err, c) => {
      return c.json({ error: err.message }, 500);
    });

    await loadExternalMiddleware(app, {
      middlewareDir: tmpDir,
      entries: [{ name: 'exploder', config: {}, enabled: true }],
    });

    app.get('/test', (c) => c.json({ ok: true }));
    const res = await app.request('/test', { method: 'GET' });
    const body: any = await res.json();
    expect(body.error).toContain('exploder');
  });
});
