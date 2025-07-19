// cacheService.ts

import { Context } from 'hono';
import { HooksService } from './hooksService';
import { endpointStrings } from '../../providers/types';
import { env } from 'hono/adapter';
import { RequestContext } from './requestContext';
import { METRICS_KEYS } from '../../globals';

export interface CacheResponseObject {
  cacheResponse: Response | undefined;
  cacheStatus: string;
  cacheKey: string | undefined;
  createdAt: Date;
  executionTime?: number;
}

export class CacheService {
  constructor(
    private honoContext: Context,
    private hooksService: HooksService
  ) {}

  isEndpointCacheable(endpoint: endpointStrings): boolean {
    const nonCacheEndpoints = [
      'uploadFile',
      'listFiles',
      'retrieveFile',
      'deleteFile',
      'retrieveFileContent',
      'createBatch',
      'retrieveBatch',
      'cancelBatch',
      'listBatches',
      'getBatchOutput',
      'listFinetunes',
      'createFinetune',
      'retrieveFinetune',
      'cancelFinetune',
    ];
    return !nonCacheEndpoints.includes(endpoint);
  }

  get getFromCacheFunction() {
    return this.honoContext.get('getFromCache');
  }

  get getCacheIdentifier() {
    return this.honoContext.get('cacheIdentifier');
  }

  get noCacheObject(): CacheResponseObject {
    return {
      cacheResponse: undefined,
      cacheStatus: 'DISABLED',
      cacheKey: undefined,
      createdAt: new Date(),
    };
  }

  private createResponseObject(
    cacheResponse: string,
    cacheStatus: string,
    cacheKey: string,
    createdAt: Date,
    responseStatus: number,
    executionTime?: number
  ): CacheResponseObject {
    return {
      cacheResponse: new Response(cacheResponse, {
        headers: { 'content-type': 'application/json' },
        status: responseStatus,
      }),
      cacheStatus,
      cacheKey,
      createdAt,
      executionTime,
    };
  }

  async getCachedResponse(
    context: RequestContext,
    headers: HeadersInit
  ): Promise<CacheResponseObject> {
    if (!this.isEndpointCacheable(context.endpoint)) {
      return this.noCacheObject;
    }

    const startTime = new Date();
    const { mode, maxAge } = context.cacheConfig;

    if (!(this.getFromCacheFunction && mode)) {
      return this.noCacheObject;
    }

    this.honoContext.set(METRICS_KEYS.LLM_CACHE_GET_START, Date.now());

    const [cacheResponse, cacheStatus, cacheKey] =
      await this.getFromCacheFunction(
        env(context.honoContext),
        { ...context.requestHeaders, ...headers },
        context.transformedRequestBody,
        context.requestURL,
        this.getCacheIdentifier,
        mode,
        maxAge
      );

    this.honoContext.set(METRICS_KEYS.LLM_CACHE_GET_END, Date.now());

    if (!cacheResponse) {
      return {
        cacheResponse: undefined,
        cacheStatus: cacheStatus || 'DISABLED',
        cacheKey: !!cacheKey ? cacheKey : undefined,
        createdAt: startTime,
      };
    }

    let responseBody: string = cacheResponse;
    let responseStatus: number = 200;

    const brhResults = this.hooksService.results?.beforeRequestHooksResult;
    if (brhResults?.length) {
      responseBody = JSON.stringify({
        ...JSON.parse(responseBody),
        hook_results: {
          before_request_hooks: brhResults,
        },
      });
      responseStatus = this.hooksService.hasFailedHooks('beforeRequest')
        ? 246
        : 200;
    }

    return this.createResponseObject(
      responseBody,
      cacheStatus,
      cacheKey,
      startTime,
      responseStatus,
      Date.now() - startTime.getTime()
    );
  }
}
