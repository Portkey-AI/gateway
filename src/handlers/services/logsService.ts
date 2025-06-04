// logsService.ts

import { Context } from 'hono';
import { RequestContext } from './requestContext';
import { ProviderContext } from './providerContext';

export class LogsService {
  constructor(private honoContext: Context) {}

  async createLogObject(
    requestContext: RequestContext,
    providerContext: ProviderContext,
    hookSpanId: string,
    cacheKey: string | undefined,
    fetchOptions: RequestInit,
    cacheStatus: string | undefined,
    finalMappedResponse: Response,
    originalResponseJSON: Record<string, any> | null | undefined,
    createdAt: Date = new Date(),
    executionTime?: number
  ) {
    return {
      providerOptions: {
        ...requestContext.providerOption,
        requestURL: await providerContext.getFullURL(requestContext),
        rubeusURL: requestContext.endpoint,
      },
      transformedRequest: {
        body: requestContext.transformedRequestBody,
        headers: fetchOptions.headers,
      },
      requestParams: requestContext.transformedRequestBody,
      finalUntransformedRequest: {
        body: requestContext.params,
      },
      originalResponse: {
        body: originalResponseJSON,
      },
      createdAt: createdAt,
      response: finalMappedResponse.clone(),
      cacheStatus,
      lastUsedOptionIndex: requestContext.index,
      cacheKey,
      cacheMode: requestContext.cacheConfig.mode,
      cacheMaxAge: requestContext.cacheConfig.maxAge,
      hookSpanId: hookSpanId,
      executionTime: executionTime,
    };
  }

  get requestLogs(): any[] {
    return this.honoContext.get('requestOptions') ?? [];
  }

  addRequestLog(log: any) {
    this.honoContext.set('requestOptions', [...this.requestLogs, log]);
  }
}
