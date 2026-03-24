import {
  getGatewayPublicHost,
  isLocalGatewayHost,
  normalizeGatewayPublicHost,
  resetGatewayMirrorHostCache,
  resolveHostForAktoMirror,
} from '../../../../src/utils/gatewayPublicHost';

describe('gatewayPublicHost', () => {
  afterEach(() => {
    resetGatewayMirrorHostCache();
  });
  describe('normalizeGatewayPublicHost', () => {
    it('returns empty for empty input', () => {
      expect(normalizeGatewayPublicHost('')).toBe('');
      expect(normalizeGatewayPublicHost(undefined)).toBe('');
    });

    it('parses URL to host', () => {
      expect(normalizeGatewayPublicHost('https://api.example.com/v1')).toBe(
        'api.example.com'
      );
    });

    it('keeps host:port from URL', () => {
      expect(normalizeGatewayPublicHost('http://api.example.com:8080')).toBe(
        'api.example.com:8080'
      );
    });

    it('uses bare hostname', () => {
      expect(normalizeGatewayPublicHost('my.gateway.internal')).toBe(
        'my.gateway.internal'
      );
    });
  });

  describe('isLocalGatewayHost', () => {
    it('treats empty as local', () => {
      expect(isLocalGatewayHost('')).toBe(true);
    });

    it('detects localhost variants', () => {
      expect(isLocalGatewayHost('localhost')).toBe(true);
      expect(isLocalGatewayHost('localhost:8787')).toBe(true);
      expect(isLocalGatewayHost('127.0.0.1')).toBe(true);
      expect(isLocalGatewayHost('::1')).toBe(true);
    });

    it('treats public hosts as non-local', () => {
      expect(isLocalGatewayHost('rahul496k.chrome.chatgpt.com')).toBe(false);
      expect(isLocalGatewayHost('api.portkey.ai')).toBe(false);
    });
  });

  describe('resolveHostForAktoMirror', () => {
    it('uses configured host when incoming is local', () => {
      expect(
        resolveHostForAktoMirror(
          'localhost:8787',
          'rahul496k.chrome.chatgpt.com'
        )
      ).toBe('rahul496k.chrome.chatgpt.com');
    });

    it('keeps real Host when not local', () => {
      expect(
        resolveHostForAktoMirror(
          'api.customer.com',
          'rahul496k.chrome.chatgpt.com'
        )
      ).toBe('api.customer.com');
    });

    it('uses configured when incoming missing', () => {
      expect(resolveHostForAktoMirror('', 'mirror.example.com')).toBe(
        'mirror.example.com'
      );
    });
  });

  describe('getGatewayPublicHost', () => {
    const key = 'PORTKEY_GATEWAY_PUBLIC_HOST';
    const mirrorKey = 'PORTKEY_GATEWAY_MIRROR_HOST_PARENT';
    const prev = process.env[key];
    const prevMirror = process.env[mirrorKey];

    afterEach(() => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
      if (prevMirror === undefined) delete process.env[mirrorKey];
      else process.env[mirrorKey] = prevMirror;
    });

    it('reads from env object first', () => {
      delete process.env[key];
      expect(
        getGatewayPublicHost({ PORTKEY_GATEWAY_PUBLIC_HOST: 'from.binding' })
      ).toBe('from.binding');
    });

    it('falls back to process.env', () => {
      process.env[key] = 'https://from.process/env';
      expect(getGatewayPublicHost()).toBe('from.process');
    });

    it('generates {id}.parent when PORTKEY_GATEWAY_MIRROR_HOST_PARENT is set', () => {
      delete process.env[key];
      process.env[mirrorKey] = 'chrome.portkey.com';
      const h = getGatewayPublicHost();
      expect(h).toMatch(/^[a-z0-9]{9}\.chrome\.portkey\.com$/);
      expect(getGatewayPublicHost()).toBe(h);
    });

    it('prefers PORTKEY_GATEWAY_PUBLIC_HOST over mirror parent', () => {
      process.env[key] = 'fixed.api.com';
      process.env[mirrorKey] = 'chrome.portkey.com';
      expect(getGatewayPublicHost()).toBe('fixed.api.com');
    });

    it('reads mirror parent from hook env binding', () => {
      delete process.env[key];
      delete process.env[mirrorKey];
      const h = getGatewayPublicHost({
        PORTKEY_GATEWAY_MIRROR_HOST_PARENT: 'llm.portkey.com',
      });
      expect(h).toMatch(/^[a-z0-9]{9}\.llm\.portkey\.com$/);
    });
  });
});
