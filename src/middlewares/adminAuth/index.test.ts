import { parseCookies } from './index';

describe('adminAuth parseCookies', () => {
  it('should return an empty object for empty or undefined cookie header', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('should parse standard single and multiple cookies', () => {
    const header = 'foo=bar; session=abc123';
    expect(parseCookies(header)).toEqual({
      foo: 'bar',
      session: 'abc123',
    });
  });

  it('should properly decode standard percent-encoded cookie values', () => {
    const header = 'user=John%20Doe; path=%2Fhome';
    expect(parseCookies(header)).toEqual({
      user: 'John Doe',
      path: '/home',
    });
  });

  it('should handle unencoded % characters without throwing URIError (issue #1864)', () => {
    const header = 'discount=50%off; portkey_admin_session=valid-uuid-123';
    expect(() => parseCookies(header)).not.toThrow();
    const result = parseCookies(header);
    expect(result.discount).toBe('50%off');
    expect(result.portkey_admin_session).toBe('valid-uuid-123');
  });

  it('should handle malformed UTF-8 percent-encoded bytes gracefully', () => {
    const header = 'malformed=%E0%A4%A; regular=hello';
    expect(() => parseCookies(header)).not.toThrow();
    const result = parseCookies(header);
    expect(result.malformed).toBe('%E0%A4%A');
    expect(result.regular).toBe('hello');
  });

  it('should handle cookies with multiple equals signs', () => {
    const header = 'token=abc=def=ghi; valid=true';
    expect(parseCookies(header)).toEqual({
      token: 'abc=def=ghi',
      valid: 'true',
    });
  });
});
