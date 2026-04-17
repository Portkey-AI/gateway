import { GatewayError } from '../../errors/GatewayError';
import { assertSafeUrlComponent, assertSafeRequestUrl } from './urlValidation';

describe('assertSafeUrlComponent', () => {
  describe('accepts safe values', () => {
    it.each([
      ['my-resource'],
      ['resource.with.dots'],
      ['resource_with_underscores'],
      ['alphanumeric123'],
      ['us-central1'],
      ['europe-west1'],
      ['my-project-123'],
      ['myorg-myaccount'],
      ['xy12345.us-east-1.aws'],
    ])('accepts %s', (value) => {
      expect(() => assertSafeUrlComponent('test', value)).not.toThrow();
    });

    it('skips undefined', () => {
      expect(() => assertSafeUrlComponent('test', undefined)).not.toThrow();
    });

    it('skips empty string', () => {
      expect(() => assertSafeUrlComponent('test', '')).not.toThrow();
    });

    it('skips null', () => {
      expect(() => assertSafeUrlComponent('test', null)).not.toThrow();
    });
  });

  describe('rejects URL parser directives', () => {
    it.each([
      ['evil.com#', '# fragment'],
      ['evil.com/', '/ path'],
      ['user@evil.com', '@ userinfo'],
      ['evil.com?x=1', '? query'],
      ['evil.com:8080', ': port'],
      ['evil\\com', '\\ backslash'],
      ['evil%20com', '% percent'],
      ['169.254.169.254#', '# with IMDS target'],
    ])('rejects %s (%s)', (value) => {
      expect(() => assertSafeUrlComponent('test', value)).toThrow(GatewayError);
    });
  });

  describe('rejects whitespace and control chars', () => {
    it.each([[' '], ['foo bar'], ['foo\tbar'], ['foo\nbar'], ['foo\0bar']])(
      'rejects %j',
      (value) => {
        expect(() => assertSafeUrlComponent('test', value)).toThrow(
          GatewayError
        );
      }
    );
  });

  describe('length limit', () => {
    it('accepts values up to 253 chars', () => {
      expect(() =>
        assertSafeUrlComponent('test', 'a'.repeat(253))
      ).not.toThrow();
    });

    it('rejects values over 253 chars', () => {
      expect(() => assertSafeUrlComponent('test', 'a'.repeat(254))).toThrow(
        /exceeds 253/
      );
    });
  });

  it('includes the field name in the error message', () => {
    expect(() =>
      assertSafeUrlComponent('azure resource name', 'evil#')
    ).toThrow(/azure resource name/);
  });

  it('returns HTTP 400 on rejection', () => {
    try {
      assertSafeUrlComponent('test', 'evil#');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect((err as GatewayError).status).toBe(400);
    }
  });
});

describe('assertSafeRequestUrl', () => {
  it('accepts normal URLs', () => {
    expect(() =>
      assertSafeRequestUrl('https://api.openai.com/v1/chat/completions')
    ).not.toThrow();
  });

  it('accepts URLs with query strings', () => {
    expect(() =>
      assertSafeRequestUrl('https://api.example.com/path?foo=bar')
    ).not.toThrow();
  });

  it('rejects URLs with fragments', () => {
    expect(() =>
      assertSafeRequestUrl('https://evil.com#.openai.azure.com/openai')
    ).toThrow(/fragment not permitted/);
  });

  it('rejects URLs with userinfo', () => {
    expect(() =>
      assertSafeRequestUrl('https://user:pass@evil.com/path')
    ).toThrow(/credentials in URL not permitted/);
  });

  it('rejects URLs with just a username', () => {
    expect(() => assertSafeRequestUrl('https://user@evil.com/path')).toThrow(
      /credentials in URL not permitted/
    );
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeRequestUrl('not a url')).toThrow(
      /Invalid request URL/
    );
  });
});
