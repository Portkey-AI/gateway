import { parseMiddlewareConfig } from '../middlewareConfig';

describe('parseMiddlewareConfig', () => {
  it('returns empty array when no middleware key', () => {
    const result = parseMiddlewareConfig({});
    expect(result).toEqual({ middlewareDir: './middleware', entries: [] });
  });

  it('parses valid middleware config', () => {
    const conf = {
      middleware_dir: './custom',
      middleware: [
        { name: 'cache-optimizer', config: { windowSize: 8 } },
        { name: 'telemetry' },
      ],
    };
    const result = parseMiddlewareConfig(conf);
    expect(result.middlewareDir).toBe('./custom');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      name: 'cache-optimizer',
      config: { windowSize: 8 },
      enabled: true,
    });
    expect(result.entries[1]).toEqual({
      name: 'telemetry',
      config: {},
      enabled: true,
    });
  });

  it('filters disabled middleware', () => {
    const conf = {
      middleware: [{ name: 'active' }, { name: 'disabled', enabled: false }],
    };
    const result = parseMiddlewareConfig(conf);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('active');
  });

  it('defaults middleware_dir to ./middleware', () => {
    const conf = { middleware: [{ name: 'test' }] };
    const result = parseMiddlewareConfig(conf);
    expect(result.middlewareDir).toBe('./middleware');
  });

  it('CLI flag overrides conf middleware_dir', () => {
    const conf = {
      middleware_dir: './from-conf',
      middleware: [{ name: 'test' }],
    };
    const result = parseMiddlewareConfig(conf, './from-cli');
    expect(result.middlewareDir).toBe('./from-cli');
  });

  it('throws on invalid entry (missing name)', () => {
    const conf = { middleware: [{ config: {} }] };
    expect(() => parseMiddlewareConfig(conf)).toThrow('name');
  });
});
