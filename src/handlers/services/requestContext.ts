// requestContext.ts

import { Context } from 'hono';
import {
  CacheSettings,
  Options,
  Params,
  RetrySettings,
} from '../../types/requestBody';
import { endpointStrings } from '../../providers/types';
import { HEADER_KEYS, RETRY_STATUS_CODES } from '../../globals';
import { HookObject } from '../../middlewares/hooks/types';
import { HooksManager } from '../../middlewares/hooks';
import { transformToProviderRequest } from '../../services/transformToProviderRequest';

export class RequestContext {
  private _params: Params | null = null;
  private _transformedRequestBody: any;
  public readonly providerOption: Options;
  private _requestURL: string = ''; // Is set at the beginning of tryPost()

  constructor(
    public readonly honoContext: Context,
    providerOption: Options,
    public readonly endpoint: endpointStrings,
    public readonly requestHeaders: Record<string, string>,
    public readonly requestBody:
      | Params
      | FormData
      | ReadableStream
      | ArrayBuffer,
    public readonly method: string = 'POST',
    public readonly index: number | string
  ) {
    this.providerOption = providerOption;
    this.providerOption.retry = this.normalizeRetryConfig(providerOption.retry);
  }

  get requestURL(): string {
    return this._requestURL;
  }

  set requestURL(requestURL: string) {
    this._requestURL = requestURL;
  }

  get overrideParams(): Params {
    return this.providerOption?.overrideParams ?? {};
  }

  get params(): Params {
    if (this._params !== null) {
      return this._params;
    }
    return this.requestBody instanceof ReadableStream ||
      this.requestBody instanceof FormData ||
      !this.requestBody
      ? {}
      : { ...this.requestBody, ...this.overrideParams };
  }

  set params(params: Params) {
    this._params = params;
  }

  set transformedRequestBody(transformedRequestBody: any) {
    this._transformedRequestBody = transformedRequestBody;
  }

  get transformedRequestBody(): any {
    return this._transformedRequestBody;
  }

  getHeader(key: string): string {
    if (key == HEADER_KEYS.CONTENT_TYPE) {
      return (
        this.requestHeaders[HEADER_KEYS.CONTENT_TYPE.toLowerCase()]?.split(
          ';'
        )[0] ?? ''
      );
    }
    return this.requestHeaders[key] ?? '';
  }

  get traceId(): string {
    return this.requestHeaders[HEADER_KEYS.TRACE_ID] ?? '';
  }

  get isStreaming(): boolean {
    if (
      (this.endpoint === 'imageEdit' ||
        this.endpoint === 'createTranscription') &&
      this.requestBody instanceof FormData
    )
      return this.requestBody.get('stream') === 'true';
    return this.params.stream === true;
  }

  get strictOpenAiCompliance(): boolean {
    const headerKey = HEADER_KEYS.STRICT_OPEN_AI_COMPLIANCE;
    if (
      this.requestHeaders[headerKey] === 'false' ||
      this.providerOption.strictOpenAiCompliance === false
    ) {
      return false;
    }
    return true;
  }

  get metadata(): Record<string, string> {
    try {
      return JSON.parse(this.requestHeaders[HEADER_KEYS.METADATA] ?? '{}');
    } catch (error) {
      return {};
    }
  }

  get forwardHeaders(): string[] {
    const headerKey = HEADER_KEYS.FORWARD_HEADERS;
    return (
      this.requestHeaders[headerKey]?.split(',').map((h) => h.trim()) ||
      this.providerOption.forwardHeaders ||
      []
    );
  }

  get customHost(): string {
    return (
      this.requestHeaders[HEADER_KEYS.CUSTOM_HOST] ||
      this.providerOption.customHost ||
      ''
    );
  }

  get requestTimeout(): number | null {
    const headerKey = HEADER_KEYS.REQUEST_TIMEOUT;
    return (
      Number(this.requestHeaders[headerKey]) ||
      this.providerOption.requestTimeout ||
      null
    );
  }

  get provider(): string {
    return this.providerOption?.provider ?? '';
  }

  private normalizeRetryConfig(retry?: RetrySettings): RetrySettings {
    return {
      attempts: retry?.attempts ?? 0,
      onStatusCodes: retry?.attempts
        ? retry?.onStatusCodes ?? RETRY_STATUS_CODES
        : [],
      useRetryAfterHeader: retry?.useRetryAfterHeader,
    };
  }

  get retryConfig(): RetrySettings {
    return this.providerOption.retry!;
  }

  get cacheConfig(): CacheSettings & { cacheStatus: string } {
    const cacheConfig = this.providerOption?.cache;
    let cacheStatus = 'DISABLED';
    if (typeof cacheConfig === 'object' && cacheConfig?.mode) {
      cacheStatus = cacheConfig.mode === 'DISABLED' ? 'DISABLED' : 'MISS';
      return {
        mode: cacheConfig.mode,
        maxAge: cacheConfig.maxAge
          ? parseInt(cacheConfig.maxAge.toString())
          : undefined,
        cacheStatus,
      };
    } else if (typeof cacheConfig === 'string') {
      return {
        mode: cacheConfig,
        maxAge: undefined,
        cacheStatus: cacheConfig === 'DISABLED' ? 'DISABLED' : 'MISS',
      };
    }
    return { mode: 'DISABLED', maxAge: undefined, cacheStatus };
  }

  hasRetries(): boolean {
    return this.retryConfig?.attempts > 0;
  }

  get beforeRequestHooks(): HookObject[] {
    return [
      ...(this.providerOption?.beforeRequestHooks || []),
      ...(this.providerOption?.defaultInputGuardrails || []),
    ];
  }

  get afterRequestHooks(): HookObject[] {
    return [
      ...(this.providerOption?.afterRequestHooks || []),
      ...(this.providerOption?.defaultOutputGuardrails || []),
    ];
  }

  get hooksManager(): HooksManager {
    return this.honoContext.get('hooksManager');
  }

  /**
   * Transforms the request body to the provider request body and
   * sets the transformed request body to the request context.
   * @returns The transformed request body.
   */
  transformToProviderRequestAndSave() {
    if (this.method !== 'POST') {
      this.transformedRequestBody = this.requestBody;
      return;
    }
    this.transformedRequestBody = transformToProviderRequest(
      this.provider,
      this.params,
      this.requestBody,
      this.endpoint,
      this.requestHeaders,
      this.providerOption
    );
  }

  get requestOptions(): any[] {
    return this.honoContext.get('requestOptions') ?? [];
  }

  appendRequestOptions(requestOptions: any) {
    this.honoContext.set('requestOptions', [
      ...this.requestOptions,
      requestOptions,
    ]);
  }

  updateModelPricingConfig(modelPricingConfig: Record<string, any>) {
    this.providerOption.modelPricingConfig = modelPricingConfig;
  }
}
