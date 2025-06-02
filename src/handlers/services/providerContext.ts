// providerContext.ts

import {
  ProviderAPIConfig,
  ProviderConfigs,
  RequestHandlers,
} from '../../providers/types';
import Providers from '../../providers';
import { RequestContext } from './requestContext';
import { ANTHROPIC } from '../../globals';
import { AZURE_OPEN_AI } from '../../globals';

export class ProviderContext {
  // Using a WeakMap to cache the URL for the provider.
  // This is to avoid recalculating the URL for the same request.
  // GC will clear the cache when the request context is no longer needed.
  private urlCache = new WeakMap<RequestContext, string>();

  constructor(private provider: string) {
    if (!Providers[provider]) {
      throw new Error(`Provider ${provider} not found`);
    }
  }

  get providerConfig(): ProviderConfigs {
    return Providers[this.provider];
  }

  get apiConfig(): ProviderAPIConfig {
    return this.providerConfig.api;
  }

  async getHeaders(context: RequestContext): Promise<Record<string, any>> {
    return await this.apiConfig?.headers({
      c: context.honoContext,
      providerOptions: context.providerOption,
      fn: context.endpoint,
      transformedRequestBody: context.transformedRequestBody,
      transformedRequestUrl: context.honoContext.req.url,
      gatewayRequestBody: context.params,
    });
  }

  /**
   * Get the base URL for the provider. Be careful, this returns a promise.
   * @returns The base URL for the provider.
   */
  async getBaseURL(context: RequestContext): Promise<string> {
    return await this.apiConfig.getBaseURL({
      providerOptions: context.providerOption,
      fn: context.endpoint,
      c: context.honoContext,
      gatewayRequestURL: context.honoContext.req.url,
    });
  }

  getEndpointPath(context: RequestContext): string {
    return this.apiConfig.getEndpoint({
      c: context.honoContext,
      providerOptions: context.providerOption,
      fn: context.endpoint,
      gatewayRequestBodyJSON: context.params,
      gatewayRequestBody: {}, // not using anywhere.
      gatewayRequestURL: context.honoContext.req.url,
    });
  }

  getProxyPath(context: RequestContext, baseURL: string): string {
    let reqURL = new URL(context.honoContext.req.url);
    let reqPath = reqURL.pathname;
    const reqQuery = reqURL.search;
    const proxyEndpointPath =
      reqURL.pathname.indexOf('/v1/proxy') > -1 ? '/v1/proxy' : '/v1';
    reqPath = reqPath.replace(proxyEndpointPath, '');

    if (
      this.provider === AZURE_OPEN_AI &&
      reqPath.includes('.openai.azure.com')
    ) {
      return `https:/${reqPath}${reqQuery}`;
    }

    if (this.apiConfig?.getProxyEndpoint) {
      return `${baseURL}${this.apiConfig.getProxyEndpoint({
        reqPath,
        reqQuery,
        providerOptions: context.providerOption,
      })}`;
    }

    let proxyPath = `${baseURL}${reqPath}${reqQuery}`;

    if (this.provider === ANTHROPIC) {
      proxyPath = proxyPath.replace('/v1/v1/', '/v1/');
    }

    return proxyPath;
  }

  async getFullURL(context: RequestContext): Promise<string> {
    if (this.urlCache.has(context)) {
      return this.urlCache.get(context)!;
    }

    const baseURL = context.customHost || (await this.getBaseURL(context));
    let url: string;
    if (context.endpoint === 'proxy') {
      url = this.getProxyPath(context, baseURL);
    } else {
      const endpointPath = this.getEndpointPath(context);
      url = `${baseURL}${endpointPath}`;
    }

    this.urlCache.set(context, url);
    return url;
  }

  get requestHandlers(): RequestHandlers {
    return this.providerConfig?.requestHandlers ?? {};
  }

  hasRequestHandler(context: RequestContext): boolean {
    return Boolean(this.requestHandlers?.[context.endpoint]);
  }

  getRequestHandler(
    context: RequestContext
  ): (() => Promise<Response>) | undefined {
    const requestHandler = this.requestHandlers?.[context.endpoint];
    if (!requestHandler) {
      return undefined;
    }

    return () =>
      requestHandler({
        c: context.honoContext,
        providerOptions: context.providerOption,
        requestURL: context.honoContext.req.url,
        requestHeaders: context.requestHeaders,
        requestBody: context.requestBody,
      });
  }
}
