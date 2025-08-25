// responseService.ts

import { HEADER_KEYS, POWERED_BY, RESPONSE_HEADER_KEYS } from '../../globals';
import { responseHandler } from '../responseHandlers';
import { HooksService } from './hooksService';
import { RequestContext } from './requestContext';

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
    private hooksService: HooksService
  ) {}

  async create(options: CreateResponseOptions): Promise<{
    response: Response;
    responseJson?: Record<string, any> | null;
    originalResponseJson?: Record<string, any> | null;
  }> {
    const {
      response,
      responseTransformer,
      isResponseAlreadyMapped,
      cache,
      retryAttempt,
      originalResponseJson,
    } = options;

    let finalMappedResponse: Response;
    let originalResponseJSON: Record<string, any> | null | undefined;
    let responseJson: Record<string, any> | null | undefined;

    if (isResponseAlreadyMapped) {
      finalMappedResponse = response;
      originalResponseJSON = originalResponseJson;
    } else {
      ({
        response: finalMappedResponse,
        originalResponseJson: originalResponseJSON,
        responseJson: responseJson,
      } = await this.getResponse(
        response,
        responseTransformer,
        cache.isCacheHit
      ));
    }

    this.updateHeaders(finalMappedResponse, cache.cacheStatus, retryAttempt);

    return {
      response: finalMappedResponse,
      responseJson,
      originalResponseJson: originalResponseJSON,
    };
  }

  async getResponse(
    response: Response,
    responseTransformer: string | undefined,
    isCacheHit: boolean
  ): Promise<{
    response: Response;
    originalResponseJson?: Record<string, any> | null;
    responseJson?: Record<string, any> | null;
  }> {
    const url = this.context.requestURL;
    return await responseHandler(
      response,
      this.context.isStreaming,
      this.context.providerOption,
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
    // Append headers directly
    response.headers.append(
      RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX,
      this.context.index.toString()
    );
    response.headers.append(
      RESPONSE_HEADER_KEYS.TRACE_ID,
      this.context.traceId
    );
    response.headers.append(
      RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT,
      retryAttempt.toString()
    );

    if (cacheStatus) {
      response.headers.append(RESPONSE_HEADER_KEYS.CACHE_STATUS, cacheStatus);
    }

    if (this.context.provider && this.context.provider !== POWERED_BY) {
      response.headers.append(HEADER_KEYS.PROVIDER, this.context.provider);
    }

    // Remove headers directly
    // const encoding = response.headers.get('content-encoding');
    // if (encoding?.includes('br') || getRuntimeKey() == 'node') {
    //   response.headers.delete('content-encoding');
    // }
    response.headers.delete('content-length');
    // response.headers.delete('transfer-encoding');

    return response;
  }
}
