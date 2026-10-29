import { parseCookies } from './parseCookies';

describe('parseCookies', () => {
  it('decodes URI-encoded cookie values', () => {
    expect(parseCookies('a=hello%20world')).toEqual({ a: 'hello world' });
  });

  it('falls back to the raw value when decodeURIComponent throws', () => {
    expect(parseCookies('promo=50%off; portkey_admin_session=abc')).toEqual({
      promo: '50%off',
      portkey_admin_session: 'abc',
    });
  });

  it('returns an empty object for a missing header', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});
