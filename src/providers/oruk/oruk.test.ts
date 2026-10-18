import { Context } from 'hono';
import { ORUK, VALID_PROVIDERS } from '../../globals';
import Providers from '../index';
import providerCatalog from '../../data/providers.json';
import { ProviderContext } from '../../handlers/services/providerContext';
import { RequestContext } from '../../handlers/services/requestContext';
import { constructRequest } from '../../handlers/handlerUtils';
import { responseHandler } from '../../handlers/responseHandlers';

const MODEL = 'Qwen/Qwen3-ASR-1.7B';
const KEY = 'test-only-oruk-key';
const URL = 'https://qwen3-asr.oruk.ai/v1/audio/transcriptions';

function context(form = new FormData()) {
  const hono = {
    req: { url: 'http://localhost/v1/audio/transcriptions' },
  } as Context;
  return new RequestContext(
    hono,
    { provider: ORUK, apiKey: KEY },
    'createTranscription',
    { 'content-type': 'multipart/form-data; boundary=client-boundary' },
    form,
    'POST',
    0
  );
}

async function mapResponse(response: Response) {
  return responseHandler(
    context().honoContext,
    response,
    false,
    { provider: ORUK, apiKey: KEY },
    'createTranscription',
    URL,
    false,
    {},
    true,
    'http://localhost/v1/audio/transcriptions',
    false,
    ''
  );
}

describe('Oruk transcription provider', () => {
  test('registers a transcription-only provider and discovery entry', () => {
    expect(VALID_PROVIDERS).toContain(ORUK);
    expect(Object.keys(Providers[ORUK]).sort()).toEqual([
      'api',
      'createTranscription',
    ]);
    expect(providerCatalog.data.find(({ id }) => id === ORUK)).toMatchObject({
      name: 'Oruk',
      base_url: 'https://qwen3-asr.oruk.ai/v1',
    });
  });

  test('uses the real transcription origin and provider Bearer credential', async () => {
    const request = context();
    const provider = new ProviderContext(ORUK);
    expect(await provider.getFullURL(request)).toBe(URL);
    expect(await provider.getHeaders(request)).toEqual({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'multipart/form-data',
    });
  });

  test('fails locally for a missing credential', async () => {
    const request = context();
    delete request.providerOption.apiKey;
    await expect(new ProviderContext(ORUK).getHeaders(request)).rejects.toThrow(
      'An Oruk API key is required'
    );
  });

  test('does not map chat requests to the speech endpoint', async () => {
    const request = context();
    expect(() =>
      Providers[ORUK].api.getEndpoint({ fn: 'chatComplete' })
    ).toThrow('chatComplete is not supported by oruk');
    const chatContext = new RequestContext(
      request.honoContext,
      request.providerOption,
      'chatComplete',
      { 'content-type': 'application/json' },
      { model: MODEL, messages: [] },
      'POST',
      0
    );
    expect(() => chatContext.transformToProviderRequestAndSave()).toThrow(
      'chatComplete is not supported by oruk'
    );
  });

  test('preserves multipart audio bytes and lets fetch generate its boundary', async () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0xff, 0x80, 0]);
    const form = new FormData();
    form.append('model', MODEL);
    form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'sample.wav');
    form.append('response_format', 'json');
    const request = context(form);
    request.transformToProviderRequestAndSave();
    const options = await constructRequest(new ProviderContext(ORUK), request);
    expect(options.body).toBe(form);
    const outbound = new Request(URL, options);
    expect(outbound.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    const contentType = outbound.headers.get('content-type');
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(contentType).not.toContain('client-boundary');
    const parsed = await outbound.formData();
    expect(parsed.get('model')).toBe(MODEL);
    expect(parsed.get('response_format')).toBe('json');
    const file = parsed.get('file') as unknown as Blob;
    expect(file).toBeInstanceOf(Blob);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  });

  test('preserves JSON transcription responses', async () => {
    const input = { text: 'Public sample transcript.' };
    const mapped = await mapResponse(
      new Response(JSON.stringify(input), {
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(mapped.response.status).toBe(200);
    expect(await mapped.response.json()).toEqual(input);
  });

  test('preserves response_format=text without converting it into JSON', async () => {
    const mapped = await mapResponse(
      new Response('Public sample transcript.', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    );
    expect(mapped.response.headers.get('content-type')).toContain('text/plain');
    expect(await mapped.response.text()).toBe('Public sample transcript.');
  });

  test.each([401, 413, 429, 503])(
    'preserves upstream HTTP %s errors',
    async (status) => {
      const input = { detail: 'The transcription request was rejected.' };
      const mapped = await mapResponse(
        new Response(JSON.stringify(input), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      );
      expect(mapped.response.status).toBe(status);
      expect(await mapped.response.json()).toEqual(input);
    }
  );
});
