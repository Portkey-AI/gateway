import { requestEndpointPath } from '../../../../src/middlewares/log/index';

describe('requestEndpointPath', () => {
  it('returns pathname and search from an absolute URL on the default port', () => {
    expect(
      requestEndpointPath('http://localhost:8787/v1/chat/completions?stream=true')
    ).toBe('/v1/chat/completions?stream=true');
  });

  it('does not depend on the listen port being 8787', () => {
    expect(requestEndpointPath('http://localhost:3000/v1/completions')).toBe(
      '/v1/completions'
    );
  });

  it('keeps a relative path unchanged', () => {
    expect(requestEndpointPath('/v1/embeddings')).toBe('/v1/embeddings');
  });
});
