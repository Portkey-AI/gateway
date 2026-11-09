import { CohereEmbedResponse, CohereEmbedResponseTransform } from './embed';

const vectors = [
  [0.25, -0.5],
  [1, 0],
];
const base64 = ['AACAPgAAAL8=', 'AACAPwAAAAA='];

function transform(
  embeddings: { float?: number[][]; base64?: string[] },
  encodingFormat?: string,
  status = 200
) {
  const response: CohereEmbedResponse = {
    id: 'test-embedding',
    texts: ['one', 'two'],
    embeddings: embeddings as CohereEmbedResponse['embeddings'],
    meta: {
      api_version: { version: '2' },
      billed_units: {
        images: 0,
        input_tokens: 2,
        output_tokens: 0,
        search_units: 0,
        classifications: 0,
      },
      tokens: { input_tokens: 2, output_tokens: 0 },
      cached_tokens: 0,
      warnings: [],
    },
  };
  return CohereEmbedResponseTransform(
    response,
    status,
    new Headers(),
    false,
    '/v1/embeddings',
    {
      model: 'embed-english-v3.0',
      ...(encodingFormat ? { encoding_format: encodingFormat } : {}),
    }
  );
}

describe('Cohere embedding responses', () => {
  it.each([undefined, 'float'])(
    'preserves float vectors with format %s',
    (format) => {
      expect(transform({ float: vectors }, format)).toMatchObject({
        data: vectors.map((embedding, index) => ({
          object: 'embedding',
          embedding,
          index,
        })),
        model: 'embed-english-v3.0',
        usage: { prompt_tokens: 2, total_tokens: 2 },
      });
    }
  );

  it('preserves base64 vectors and their indexes', () => {
    expect(transform({ base64 }, 'base64')).toMatchObject({
      data: base64.map((embedding, index) => ({
        object: 'embedding',
        embedding,
        index,
      })),
      model: 'embed-english-v3.0',
      usage: { prompt_tokens: 2, total_tokens: 2 },
    });
  });

  it('uses the requested base64 representation when float vectors are also present', () => {
    expect(
      transform(
        {
          float: vectors,
          base64,
        },
        'base64'
      )
    ).toMatchObject({
      data: base64.map((embedding, index) => ({ embedding, index })),
    });
  });

  it('retains provider error responses', () => {
    expect(transform({ float: vectors }, 'base64', 400)).toMatchObject({
      provider: 'cohere',
      error: { message: 'cohere error: ' },
    });
  });
});
