import { OracleEmbedConfig, OracleEmbedResponseTransform } from './embed';

const baseProviderOptions = {
  oracleCompartmentId: 'ocid1.compartment.oc1..test',
} as any;

const transformInput = (params: any) => {
  const cfg = OracleEmbedConfig.input as any;
  return cfg.transform(params, baseProviderOptions);
};

const transformInputType = (params: any) => {
  const cfg = OracleEmbedConfig.input_type as any;
  return cfg.transform(params, baseProviderOptions);
};

const transformServingMode = (params: any) => {
  const cfg = OracleEmbedConfig.model as any;
  return cfg.transform(params, baseProviderOptions);
};

describe('Oracle Embeddings — request transform', () => {
  it('wraps a string input into the OCI inputs array', () => {
    expect(transformInput({ input: 'hello' })).toEqual(['hello']);
  });

  it('passes through an array of strings', () => {
    expect(transformInput({ input: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('extracts text from object items in input array', () => {
    const out = transformInput({
      input: [{ text: 'first' }, { text: 'second' }],
    });
    expect(out).toEqual(['first', 'second']);
  });

  it('returns undefined for empty array', () => {
    expect(transformInput({ input: [] })).toBeUndefined();
  });

  it('maps lowercase input_type to OCI uppercase', () => {
    expect(transformInputType({ input_type: 'search_document' })).toBe(
      'SEARCH_DOCUMENT'
    );
    expect(transformInputType({ input_type: 'CLUSTERING' })).toBe('CLUSTERING');
  });

  it('builds an ON_DEMAND servingMode payload', () => {
    expect(
      transformServingMode({ model: 'cohere.embed-multilingual-v3.0' })
    ).toEqual({
      servingType: 'ON_DEMAND',
      modelId: 'cohere.embed-multilingual-v3.0',
    });
  });
});

describe('Oracle Embeddings — response transform', () => {
  it('maps OCI embeddings to OpenAI shape', () => {
    const oci = {
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      modelId: 'cohere.embed-multilingual-v3.0',
      modelVersion: '1.0',
      inputTextTokenCount: 7,
    };

    const result: any = OracleEmbedResponseTransform(oci, 200, new Headers());

    expect(result.object).toBe('list');
    expect(result.data).toEqual([
      { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
      { object: 'embedding', embedding: [0.3, 0.4], index: 1 },
    ]);
    expect(result.model).toBe('cohere.embed-multilingual-v3.0');
    expect(result.usage).toEqual({ prompt_tokens: 7, total_tokens: 7 });
  });

  it('returns an error response for non-200 with code', () => {
    const result: any = OracleEmbedResponseTransform(
      { code: '400', message: 'bad input' } as any,
      400,
      new Headers()
    );
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('bad input');
  });

  it('returns invalid-provider-response when embeddings missing', () => {
    const result: any = OracleEmbedResponseTransform(
      { modelId: 'foo' } as any,
      200,
      new Headers()
    );
    expect(result.error).toBeDefined();
  });
});
