import { Portkey } from 'portkey-ai';
import { readFileSync } from 'fs';
import { join } from 'path';

const creds = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf8'));

export class RequestBuilder {
  private requestBody: Record<string, any> | FormData = {};
  private requestHeaders: Record<string, string> = {};
  private _method: string = 'POST';
  private _client: Portkey;

  constructor() {
    this.requestBody = {
      model: 'claude-3-5-sonnet-20240620',
      messages: [{ role: 'user', content: 'Hey' }],
      max_tokens: 10,
    };
    this.requestHeaders = {
      'Content-Type': 'application/json',
      'x-portkey-provider': 'anthropic',
      Authorization: `Bearer ${creds.anthropic.apiKey}`,
      'x-portkey-api-key': creds.portkey.apiKey,
    };
    this._method = 'POST';
    this._client = new Portkey({
      baseURL: 'http://localhost:8787/v1',
      config: {
        provider: 'anthropic',
        api_key: creds.anthropic.apiKey,
      },
    });
  }

  useGet() {
    this._method = 'GET';
    return this;
  }

  get client() {
    return this._client;
  }

  get options() {
    const _options: any = {
      method: this._method,
      body:
        this.requestBody instanceof FormData
          ? this.requestBody
          : JSON.stringify(this.requestBody),
      headers: { ...this.requestHeaders },
    };

    if (this.requestBody instanceof FormData) {
      const { ['Content-Type']: _, ...restHeaders } = this.requestHeaders;
      _options.headers = restHeaders;
    }

    if (this._method === 'GET') {
      delete _options.body;
    }
    return _options;
  }

  model(model: string) {
    if (this.requestBody instanceof FormData) {
      throw new Error('Model cannot be set for FormData');
    }
    this.requestBody.model = model;
    return this;
  }

  messages(messages: any[]) {
    if (this.requestBody instanceof FormData) {
      throw new Error('Messages cannot be set for FormData');
    }
    this.requestBody.messages = messages;
    return this;
  }

  maxTokens(maxTokens: number) {
    if (this.requestBody instanceof FormData) {
      throw new Error('Max tokens cannot be set for FormData');
    }
    this.requestBody.max_tokens = maxTokens;
    return this;
  }

  stream(stream: boolean) {
    if (this.requestBody instanceof FormData) {
      throw new Error('Stream cannot be set for FormData');
    }
    this.requestBody.stream = stream;
    return this;
  }

  provider(provider: string) {
    this.requestHeaders['x-portkey-provider'] = provider;
    if (provider === 'openai') {
      this.apiKey(creds.openai.apiKey);
    } else if (provider === 'anthropic') {
      this.apiKey(creds.anthropic.apiKey);
    }
    return this;
  }

  providerHeaders(providerHeaders: Record<string, string>) {
    // for each key, switch all underscores to hyphens
    // and prepend with x-portkey-
    const _providerHeaders: any = {};
    for (const [key, value] of Object.entries(providerHeaders)) {
      _providerHeaders[`x-portkey-${key.replace(/_/g, '-')}`] = value;
    }
    this.requestHeaders = {
      ...this.requestHeaders,
      ..._providerHeaders,
    };
    return this;
  }

  addHeaders(headers: Record<string, string>) {
    this.requestHeaders = {
      ...this.requestHeaders,
      ...headers,
    };
    return this;
  }

  apiKey(apiKey: string) {
    if (apiKey) {
      this.requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else {
      delete this.requestHeaders['Authorization'];
    }
    return this;
  }

  body(body: Record<string, any> | FormData) {
    this.requestBody = body;
    // If we're switching to FormData we must remove any stale JSON content-type header
    if (body instanceof FormData) {
      delete this.requestHeaders['Content-Type'];
    }
    return this;
  }

  config(config: any) {
    this._client.config = config;
    // Create headers for this config
    const configHeader = {
      'x-portkey-config': JSON.stringify(config),
    };
    this.requestHeaders = {
      ...this.requestHeaders,
      ...configHeader,
    };
    return this;
  }
}

export class URLBuilder {
  private _url: string = 'http://localhost:8787/v1';

  constructor() {}

  get url() {
    return this._url;
  }

  endpoint(endpoint: string) {
    this._url = `${this._url}/${endpoint}`;
    return this;
  }

  chat() {
    this.endpoint('chat/completions');
    return this._url;
  }

  files() {
    this.endpoint('files');
    return this._url;
  }

  transcription() {
    this.endpoint('audio/transcriptions');
    return this._url;
  }

  images() {
    this.endpoint('images/generations');
    return this._url;
  }

  path(path: string) {
    this.endpoint(path);
    return this._url;
  }

  clear() {
    this._url = 'http://localhost:8787/v1';
    return this;
  }
}
