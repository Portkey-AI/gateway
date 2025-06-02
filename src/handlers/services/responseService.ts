// responseService.ts

import { getRuntimeKey } from 'hono/adapter';
import { POWERED_BY } from '../../globals';
import { RESPONSE_HEADER_KEYS } from '../../globals';
import { responseHandler } from '../responseHandlers';
import { HooksService } from './hooksService';
import { ProviderContext } from './providerContext';
import { RequestContext } from './requestContext';
import { LogsService } from './logsService';

interface CreateResponseOptions {
  response: Response;
  responseTransformer: string | undefined;
  isResponseAlreadyMapped: boolean;
  fetchOptions?: RequestInit;
  originalResponseJson?: Record<string, any> | null;
  cache: {
    isCacheHit: boolean;
    cacheStatus: string | undefined;
    cacheKey: string | undefined;
  };
  retryAttempt: number;
  createdAt?: Date;
  executionTime?: number;
}

export class ResponseService {
  constructor(
    private context: RequestContext,
    private providerContext: ProviderContext,
    private hooksService: HooksService,
    private logsService: LogsService
  ) {}

  async create(options: CreateResponseOptions) {
    const {
      response,
      responseTransformer,
      isResponseAlreadyMapped,
      cache,
      retryAttempt,
      fetchOptions = {},
      originalResponseJson,
      createdAt,
      executionTime,
    } = options;

    let finalMappedResponse: Response;
    let originalResponseJSON: Record<string, any> | null | undefined;

    if (isResponseAlreadyMapped) {
      finalMappedResponse = response;
      originalResponseJSON = originalResponseJson;
    } else {
      ({
        response: finalMappedResponse,
        originalResponseJson: originalResponseJSON,
      } = await this.getResponse(
        response,
        responseTransformer,
        cache.isCacheHit
      ));
    }

    this.updateHeaders(finalMappedResponse, cache.cacheStatus, retryAttempt);

    // Add the log object to the logs service.
    this.logsService.addRequestLog(
      await this.logsService.createLogObject(
        this.context,
        this.providerContext,
        this.hooksService.hookSpan.id,
        cache.cacheKey,
        fetchOptions,
        cache.cacheStatus,
        finalMappedResponse,
        originalResponseJSON,
        createdAt,
        executionTime
      )
    );

    if (!finalMappedResponse.ok) {
      const errorObj: any = new Error(await finalMappedResponse.clone().text());
      errorObj.status = finalMappedResponse.status;
      errorObj.response = finalMappedResponse;
      throw errorObj;
    }

    // console.log("End tryPost", new Date().getTime());
    return finalMappedResponse;
  }

  async getResponse(
    response: Response,
    responseTransformer: string | undefined,
    isCacheHit: boolean
  ): Promise<{
    response: Response;
    originalResponseJson?: Record<string, any> | null;
  }> {
    const url = await this.providerContext.getFullURL(this.context);
    return await responseHandler(
      response,
      this.context.isStreaming,
      this.context.provider,
      responseTransformer,
      url,
      isCacheHit,
      this.context.params,
      this.context.strictOpenAiCompliance,
      this.context.honoContext.req.url,
      this.hooksService.areSyncHooksAvailable
    );
  }

  updateHeaders(
    response: Response,
    cacheStatus: string | undefined,
    retryAttempt: number
  ) {
    const headersToAppend = new Map<string, string>();
    const headersToRemove = new Set<string>();

    headersToAppend.set(
      RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX,
      this.context.index.toString()
    );
    headersToAppend.set(RESPONSE_HEADER_KEYS.TRACE_ID, this.context.traceId);
    headersToAppend.set(
      RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT,
      retryAttempt.toString()
    );

    if (cacheStatus) {
      headersToAppend.set(RESPONSE_HEADER_KEYS.CACHE_STATUS, cacheStatus);
    }

    if (this.context.provider && this.context.provider !== POWERED_BY) {
      headersToAppend.set(RESPONSE_HEADER_KEYS.PROVIDER, this.context.provider);
    }

    // Append the headers to response.headers
    for (const [key, value] of headersToAppend) {
      response.headers.append(key, value);
    }

    const encoding = response.headers.get('content-encoding');
    if (encoding?.includes('br') || getRuntimeKey() == 'node') {
      headersToRemove.add('content-encoding');
    }

    headersToRemove.add('content-length');
    headersToRemove.add('transfer-encoding');

    for (const key of headersToRemove) {
      response.headers.delete(key);
    }
    return response;
  }
}
