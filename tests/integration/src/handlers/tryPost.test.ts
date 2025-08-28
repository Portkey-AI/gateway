import { readFileSync } from 'fs';
import { RequestBuilder, URLBuilder } from './requestBuilder';
import { join } from 'path';

let requestBuilder: RequestBuilder, urlBuilder: URLBuilder;

// Gateway tests
describe('core functionality', () => {
  beforeEach(() => {
    requestBuilder = new RequestBuilder();
    urlBuilder = new URLBuilder();
  });

  it('should handle a simple chat completion request', async () => {
    const url = urlBuilder.chat();
    const options = requestBuilder.model('claude-3-5-sonnet-20240620').options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(data.choices[0].message.content).toBeDefined();
    expect(response.status).toBe(200);
  });

  it('should handle a simple chat completion request with stream', async () => {
    const url = urlBuilder.chat();
    const options = requestBuilder
      .model('claude-3-5-sonnet-20240620')
      .stream(true).options;

    const response = await fetch(url, options);

    //expect response to be a stream
    expect(response.body).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
  });

  it('should handle binary file uploads with FormData', async () => {
    const formData = new FormData();
    // Append a random file to formData
    formData.append(
      'file',
      new Blob([readFileSync('./src/handlers/tests/test.txt')]),
      'test.txt'
    );
    formData.append('purpose', 'assistants');

    const url = urlBuilder.files();
    const options = requestBuilder.provider('openai').body(formData).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.object).toBe('file');
    expect(data.purpose).toBe('assistants');
  });

  it('should handle audio transcription with ArrayBuffer', async () => {
    try {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([readFileSync('./src/handlers/tests/speech2.mp3')]),
        'speech2.mp3'
      );
      formData.append('model', 'gpt-4o-transcribe');

      const url = urlBuilder.transcription();
      const options = requestBuilder.provider('openai').body(formData).options;

      const response = await fetch(url, options);
      const data: any = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toBe('Today is a wonderful day to play.');
    } catch (error) {
      expect(error).toBeUndefined();
    }
  });

  it('should handle image generation requests', async () => {
    const url = urlBuilder.images();
    const options = requestBuilder.provider('openai').body({
      prompt: 'A beautiful sunset over a calm ocean',
      n: 1,
      size: '1024x1024',
      model: 'dall-e-3',
    }).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.data[0].b64_json || data.data[0].url).toBeDefined();
    // console.log(data.data[0].b64_json || data.data[0].url);
  });

  it('should handle proxy requests with custom paths', async () => {
    const url = urlBuilder.path('models');
    const options = requestBuilder.provider('openai').useGet().options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.object).toBe('list');

    // console.log(data);
  });

  // TODO: some more difficult proxy paths with different file types here.
});

describe.skip('tryPost-provider-specific', () => {
  beforeEach(() => {
    requestBuilder = new RequestBuilder();
    urlBuilder = new URLBuilder();
  });

  it('should handle Azure OpenAI with resource names and deployment IDs', async () => {
    // Verify Azure URL construction and headers
    const url = urlBuilder.chat();
    const creds = JSON.parse(
      readFileSync(join(__dirname, '.creds.json'), 'utf8')
    );
    const options = requestBuilder
      .provider('azure-openai')
      .apiKey(creds.azure.apiKey)
      .providerHeaders({
        resource_name: 'portkey',
        deployment_id: 'turbo-16k',
        api_version: '2023-03-15-preview',
      }).options;

    const response = await fetch(url, options);
    if (response.status !== 200) {
      console.log(await response.text());
    }
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.choices[0].message.content).toBeDefined();
  });

  it('should handle AWS Bedrock with SigV4 authentication', async () => {
    // Verify AWS auth headers are generated
    const url = urlBuilder.chat();
    const creds = JSON.parse(
      readFileSync(join(__dirname, '.creds.json'), 'utf8')
    );
    const options = requestBuilder
      .provider('bedrock')
      .model('cohere.command-r-v1:0')
      .apiKey('')
      .providerHeaders({
        aws_access_key_id: creds.aws.accessKeyId,
        aws_secret_access_key: creds.aws.secretAccessKey,
        aws_region: creds.aws.region,
      }).options;

    const response = await fetch(url, options);
    if (response.status !== 200) {
      console.log(await response.text());
    }
    const data: any = await response.json();
    // console.log(data);

    expect(response.status).toBe(200);
    expect(data.choices[0].message.content).toBeDefined();
  });

  it('should handle Google Vertex AI with service account auth', async () => {
    // Verify Vertex AI auth and URL construction
  });

  it('should handle provider with custom request handler', async () => {
    // Verify custom handlers bypass normal transformation
  });

  it.only('should handle invalid provider gracefully', async () => {
    // Verify error when provider not found
    const url = urlBuilder.chat();
    const options = requestBuilder
      .provider('non-existent-provider')
      .apiKey('some-key')
      .messages([{ role: 'user', content: 'Hello' }]).options;

    const response = await fetch(url, options);
    const error: any = await response.json();

    console.log(error);

    expect(response.status).toBe(400);
    expect(error.status).toBe('failure');
    expect(error.message).toMatch(/Invalid provider/i);
  });
});

describe('tryPost-error-handling', () => {
  beforeEach(() => {
    requestBuilder = new RequestBuilder();
    urlBuilder = new URLBuilder();
  });

  it('should through a 446 if after request guardrail fails', async () => {
    const url = urlBuilder.chat();
    const options = requestBuilder.config({
      guardrails: { enabled: true },
    });
  });

  it('should retry when status code is set', async () => {
    // Verify retry logic with default retry config
    const url = urlBuilder.chat();
    const options = requestBuilder.apiKey('wrong api key').config({
      retry: { attempts: 2, on_status_codes: [401] },
    }).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.headers.get('x-portkey-retry-attempt-count')).toBe('-1');

    expect(response.status).toBe(401);
    expect(data.error.message).toMatch(/invalid/i);
  });

  it('should handle network timeouts with requestTimeout', async () => {
    // Verify timeout cancels request
    const url = urlBuilder.chat();
    const options = requestBuilder.config({
      request_timeout: 500,
    }).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    console.log(data);
    console.log(response.status);

    expect(response.status).toBe(408);
    expect(data.error.message).toMatch(/timeout/i);
  });
});

describe('tryPost-hooks-and-guardrails', () => {
  const containsGuardrail = (
    words: string[] = ['word1', 'word2'],
    operator: string = 'any',
    not: boolean = false,
    deny: boolean = false,
    async: boolean = false
  ) => ({
    id: 'guardrail-1',
    async: async,
    type: 'guardrail',
    deny: deny,
    checks: [
      {
        id: 'default.contains',
        parameters: {
          words: words,
          operator: operator,
          not: not,
        },
      },
    ],
  });

  const exaGuardrail = () => ({
    id: 'guardrail-exa',
    type: 'guardrail',
    deny: false,
    checks: [
      {
        id: 'exa.online',
        parameters: {
          numResults: 3,
          credentials: {
            apiKey: 'ae56af0a-7d05-4595-a228-436fd36476f9',
          },
          prefix: '\nHere are some web search results:\n',
          suffix: '\n---',
        },
      },
    ],
  });

  const invalidGuardrail = () => ({
    id: 'guardrail-invalid',
    type: 'guardrail',
    deny: false,
    checks: [
      {
        id: 'invalid.check.that.does.not.exist',
        parameters: {
          // Invalid parameters that should cause an error
          invalidParam: null,
          missingRequired: undefined,
        },
      },
    ],
  });

  beforeEach(() => {
    requestBuilder = new RequestBuilder();
    urlBuilder = new URLBuilder();
  });

  it('should execute before request hooks and allow request', async () => {
    // Verify hooks run and pass
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        before_request_hooks: [
          containsGuardrail(['word1', 'word2'], 'any', false),
        ],
      })
      .messages([
        {
          role: 'user',
          content:
            'adding some text before this word1 and adding some text after',
        },
      ]).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    // console.log(data.hook_results.before_request_hooks[0].checks[0]);

    expect(response.status).toBe(200);
    expect(data.hook_results.before_request_hooks[0].checks[0]).toBeDefined();
  });

  it('should block request when before request hook denies', async () => {
    // Verify 446 response with hook results
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        before_request_hooks: [
          containsGuardrail(['word1', 'word2'], 'none', false, true),
        ],
      })
      .messages([
        {
          role: 'user',
          content:
            'adding some text before this word1 and adding some text after',
        },
      ]).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(446);
    expect(data.hook_results.before_request_hooks[0].checks[0]).toBeDefined();
  });

  it('should transform request body via before request hooks', async () => {
    // Critical: Verify hook transformations work
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        before_request_hooks: [exaGuardrail()],
      })
      .messages([
        {
          role: 'user',
          content:
            'Based on the web search results, who was the chief minister of Delhi in May 2025? reply with name only.',
        },
      ]).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.choices[0].message.content).toBeDefined();
    expect(data.choices[0].message.content).toMatch(/Rekha/i);
  });

  it('should execute after request hooks on response', async () => {
    // Verify response hooks run
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        after_request_hooks: [
          containsGuardrail(['word1', 'word2'], 'any', false),
        ],
      })
      .messages([
        {
          role: 'user',
          content: "Reply with any of 'word1' or 'word2' and nothing else.",
        },
      ]).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.hook_results.after_request_hooks[0].checks[0]).toBeDefined();
  });

  it('should handle failing after request hooks with retry', async () => {
    // Verify retry when after hooks fail
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        after_request_hooks: [
          containsGuardrail(['word1', 'word2'], 'none', false, true),
        ],
        retry: {
          attempts: 2,
          on_status_codes: [446],
        },
      })
      .messages([
        {
          role: 'user',
          content: "Reply with any of 'word1' or 'word2' and nothing else.",
        },
      ]).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(446);
    expect(response.headers.get('x-portkey-retry-attempt-count')).toBe('-1');
    expect(data.hook_results.after_request_hooks[0].checks[0]).toBeDefined();
  });

  it('should include hook results in cached responses', async () => {
    // Verify cache includes hook execution results
  });

  it('should handle async hooks without blocking', async () => {
    // Verify async hooks don't block response
    const url = urlBuilder.chat();
    const options = requestBuilder.config({
      before_request_hooks: [
        containsGuardrail(['word1', 'word2'], 'all', false, true, true),
      ],
    }).options;

    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(data.hook_results).toBeUndefined();
  });
});

describe('tryPost-caching', () => {
  beforeEach(() => {
    requestBuilder = new RequestBuilder();
    urlBuilder = new URLBuilder();
  });

  it('should cache successful responses when cache mode is simple', async () => {
    // Verify cache storage and key generation
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        cache: { mode: 'simple' },
      })
      .messages([
        { role: 'user', content: 'Hello' + new Date().getTime() },
      ]).options;

    // Store in cache
    const nonCachedResponse = await fetch(url, options);
    const nonCachedData: any = await nonCachedResponse.json();

    expect(nonCachedResponse.status).toBe(200);
    expect(nonCachedResponse.headers.get('x-portkey-cache-status')).toBe(
      'MISS'
    );

    // Get from cache
    const response = await fetch(url, options);
    const data: any = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-portkey-cache-status')).toBe('HIT');
    expect(data.choices[0].message.content).toBeDefined();
  });

  it('should not cache file upload endpoints', async () => {
    // Verify non-cacheable endpoints skip cache
    const formData = new FormData();
    // Append a random file to formData
    formData.append(
      'file',
      new Blob([readFileSync('./src/handlers/tests/test.txt')]),
      'test.txt'
    );
    formData.append('purpose', 'assistants');

    const url = urlBuilder.files();
    const options = requestBuilder.provider('openai').body(formData).options;

    const response = await fetch(url, options);

    expect(response.headers.get('x-portkey-cache-status')).toBe('DISABLED');
  });

  it('should respect cache TTL when configured', async () => {
    // Verify maxAge is passed to cache function
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        cache: { mode: 'simple', maxAge: 5000 },
      })
      .messages([
        { role: 'user', content: 'Hello' + new Date().getTime() },
      ]).options;

    // Make the request
    const response = await fetch(url, options);
    const data: any = await response.json();

    // The next request should be a hit
    const response1 = await fetch(url, options);
    const data1: any = await response1.json();

    expect(response1.headers.get('x-portkey-cache-status')).toBe('HIT');

    // Wait 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Make the request again
    const response2 = await fetch(url, options);
    const data2: any = await response2.json();

    expect(response2.status).toBe(200);
    expect(response2.headers.get('x-portkey-cache-status')).toBe('MISS');
    expect(data2.choices[0].message.content).toBeDefined();
  });

  it.skip('should handle cache with streaming responses correctly', async () => {
    // Verify streaming from cache works
    const url = urlBuilder.chat();
    const options = requestBuilder
      .config({
        cache: { mode: 'simple' },
      })
      .stream(true)
      .messages([
        { role: 'user', content: 'Hello' + new Date().getTime() },
      ]).options;

    // Store in cache
    const nonCachedResponse = await fetch(url, options);
    // The response should be a stream
    expect(nonCachedResponse.body).toBeInstanceOf(ReadableStream);

    expect(nonCachedResponse.status).toBe(200);
    expect(nonCachedResponse.headers.get('x-portkey-cache-status')).toBe(
      'MISS'
    );

    // Get from cache
    const response = await fetch(url, options);
    // The response should be a stream
    expect(response.body).toBeInstanceOf(ReadableStream);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-portkey-cache-status')).toBe('HIT');
  });
});
