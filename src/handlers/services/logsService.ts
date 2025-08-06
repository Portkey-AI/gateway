// logsService.ts

import { Context } from 'hono';
import { RequestContext } from './requestContext';
import { ProviderContext } from './providerContext';
import { ToolCall } from '../../types/requestBody';
import { z } from 'zod';

const LogObjectSchema = z.object({
  providerOptions: z.object({
    requestURL: z.string(),
    rubeusURL: z.string(),
  }),
  transformedRequest: z.object({
    body: z.any(),
    headers: z.record(z.string()),
  }),
  requestParams: z.any(),
  finalUntransformedRequest: z.object({
    body: z.any(),
  }),
  originalResponse: z.object({
    body: z.any(),
  }),
  createdAt: z.date(),
  response: z.instanceof(Response),
  cacheStatus: z.string().optional(),
  lastUsedOptionIndex: z.number().or(z.string()),
  cacheKey: z.string().optional(),
  cacheMode: z.string(),
  cacheMaxAge: z.number().optional(),
  hookSpanId: z.string(),
  executionTime: z.number().optional(),
});

export interface LogObject {
  providerOptions: {
    requestURL: string;
    rubeusURL: string;
  };
  transformedRequest: {
    body: any;
    headers: Record<string, string>;
  };
  requestParams: any;
  finalUntransformedRequest: {
    body: any;
  };
  originalResponse: {
    body: any;
  };
  createdAt: Date;
  response: Response;
  cacheStatus: string | undefined;
  lastUsedOptionIndex: number | string;
  cacheKey: string | undefined;
  cacheMode: string;
  cacheMaxAge: number;
  hookSpanId: string;
  executionTime: number;
}

export interface otlpSpanObject {
  type: 'otlp_span';
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  status: {
    code: string;
  };
  attributes: {
    key: string;
    value: {
      stringValue: string;
    };
  }[];
  events: {
    timeUnixNano: string;
    name: string;
    attributes: {
      key: string;
      value: {
        stringValue: string;
      };
    }[];
  }[];
}

export class LogsService {
  constructor(private honoContext: Context) {}

  createExecuteToolSpan(
    toolCall: ToolCall,
    toolOutput: any,
    startTimeUnixNano: number,
    endTimeUnixNano: number,
    traceId: string,
    parentSpanId?: string,
    spanId?: string
  ) {
    return {
      type: 'otlp_span',
      traceId: traceId,
      spanId: spanId ?? crypto.randomUUID(),
      parentSpanId: parentSpanId,
      name: `execute_tool ${toolCall.function.name}`,
      kind: 'SPAN_KIND_INTERNAL',
      startTimeUnixNano: startTimeUnixNano,
      endTimeUnixNano: endTimeUnixNano,
      status: {
        code: 'STATUS_CODE_OK',
      },
      attributes: [
        {
          key: 'gen_ai.operation.name',
          value: {
            stringValue: 'execute_tool',
          },
        },
        {
          key: 'gen_ai.tool.name',
          value: {
            stringValue: toolCall.function.name,
          },
        },
        {
          key: 'gen_ai.tool.description',
          value: {
            stringValue: toolCall.function.description,
          },
        },
      ],
      events: [
        {
          timeUnixNano: startTimeUnixNano,
          name: 'gen_ai.tool.input',
          attributes: Object.entries(
            JSON.parse(toolCall.function.arguments)
          ).map(([key, value]) => ({
            key: key,
            value: {
              stringValue: value,
            },
          })),
        },
        {
          timeUnixNano: endTimeUnixNano,
          name: 'gen_ai.tool.output',
          attributes: Object.entries(toolOutput).map(([key, value]) => ({
            key: key,
            value: {
              stringValue: value,
            },
          })),
        },
      ],
    };
  }

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
        requestURL: requestContext.requestURL,
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

export class LogObjectBuilder {
  private logData: Partial<LogObject> = {};
  private committed = false;

  constructor(
    private logsService: LogsService,
    private requestContext: RequestContext
  ) {
    this.logData = {
      providerOptions: {
        ...requestContext.providerOption,
        requestURL: this.requestContext.requestURL,
        rubeusURL: this.requestContext.endpoint,
      },
      finalUntransformedRequest: {
        body: this.requestContext.requestBody,
      },
      createdAt: new Date(),
      lastUsedOptionIndex: this.requestContext.index,
      cacheMode: this.requestContext.cacheConfig.mode,
      cacheMaxAge: this.requestContext.cacheConfig.maxAge,
    };
  }

  private clone() {
    const clonedLogData: Partial<LogObject> = {
      providerOptions: {
        ...this.logData.providerOptions,
        requestURL: this.logData.providerOptions?.requestURL ?? '',
        rubeusURL: this.logData.providerOptions?.rubeusURL ?? '',
      },
      finalUntransformedRequest: {
        body: this.logData.finalUntransformedRequest?.body,
      },
      createdAt: new Date(this.logData.createdAt?.getTime() ?? Date.now()),
      lastUsedOptionIndex: this.logData.lastUsedOptionIndex,
      cacheKey: this.logData.cacheKey,
      cacheMode: this.logData.cacheMode,
      cacheMaxAge: this.logData.cacheMaxAge,
      cacheStatus: this.logData.cacheStatus,
      hookSpanId: this.logData.hookSpanId,
      executionTime: this.logData.executionTime,
    };
    if (this.logData.transformedRequest) {
      clonedLogData.transformedRequest = {
        body: this.logData.transformedRequest.body,
        headers: this.logData.transformedRequest.headers,
      };
    }
    if (this.logData.requestParams) {
      clonedLogData.requestParams = this.logData.requestParams;
    }
    if (this.logData.originalResponse) {
      clonedLogData.originalResponse = {
        body: this.logData.originalResponse.body,
      };
    }
    if (this.logData.response) {
      clonedLogData.response = this.logData.response; // we don't need to clone the response, it's already cloned in the addResponse function
    }
    return clonedLogData;
  }

  updateRequestContext(
    requestContext: RequestContext,
    transformedRequestHeaders?: HeadersInit
  ) {
    this.logData.lastUsedOptionIndex = requestContext.index;
    this.logData.transformedRequest = {
      body: requestContext.transformedRequestBody,
      headers: (transformedRequestHeaders as Record<string, string>) ?? {},
    };
    this.logData.requestParams = requestContext.transformedRequestBody;
    return this;
  }

  addResponse(
    response: Response,
    originalResponseJson: Record<string, any> | null | undefined
  ) {
    this.logData.response = response.clone();
    this.logData.originalResponse = {
      body: originalResponseJson,
    };
    return this;
  }

  addExecutionTime(createdAt: Date) {
    this.logData.createdAt = createdAt;
    this.logData.executionTime = Date.now() - createdAt.getTime();
    return this;
  }

  addTransformedRequest(
    transformedRequestBody: any,
    transformedRequestHeaders: Record<string, string>
  ) {
    this.logData.transformedRequest = {
      body: transformedRequestBody,
      headers: transformedRequestHeaders,
    };
    return this;
  }

  addCache(cacheStatus?: string, cacheKey?: string) {
    this.logData.cacheStatus = cacheStatus;
    this.logData.cacheKey = cacheKey;
    return this;
  }

  addHookSpanId(hookSpanId: string) {
    this.logData.hookSpanId = hookSpanId;
    return this;
  }

  // Log the current state - can be called multiple times from different branches
  log(): this {
    if (this.committed) {
      throw new Error('Cannot log from a committed log object');
    }

    // const result = this.isComplete(this.logData);
    // if (!result) {
    //   const parsed = LogObjectSchema.safeParse(this.logData);
    //   if (!parsed.success) {
    //     console.error('Log data is not complete', parsed.error.issues);
    //   }
    // }

    // Update execution time if we have a createdAt
    if (this.logData.createdAt && this.logData.createdAt instanceof Date) {
      this.logData.executionTime =
        Date.now() - this.logData.createdAt.getTime();
    }

    this.logsService.addRequestLog(this.clone() as LogObject);
    return this;
  }

  private isComplete(obj: unknown): obj is LogObject {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function'))
      return false;
    const typedObj = obj as any;

    // providerOptions
    if (
      typedObj.providerOptions == null ||
      (typeof typedObj.providerOptions !== 'object' &&
        typeof typedObj.providerOptions !== 'function')
    )
      return false;
    if (typeof typedObj.providerOptions.requestURL !== 'string') return false;
    if (typeof typedObj.providerOptions.rubeusURL !== 'string') return false;

    // transformedRequest
    if (
      typedObj.transformedRequest == null ||
      (typeof typedObj.transformedRequest !== 'object' &&
        typeof typedObj.transformedRequest !== 'function')
    )
      return false;
    if (!('body' in typedObj.transformedRequest)) return false;
    if (
      typedObj.transformedRequest.headers == null ||
      (typeof typedObj.transformedRequest.headers !== 'object' &&
        typeof typedObj.transformedRequest.headers !== 'function')
    )
      return false;
    if (
      !Object.entries<any>(typedObj.transformedRequest.headers).every(
        ([key, value]) => typeof key === 'string' && typeof value === 'string'
      )
    )
      return false;

    // requestParams (any)
    if (!('requestParams' in typedObj)) return false;

    // finalUntransformedRequest
    if (
      typedObj.finalUntransformedRequest == null ||
      (typeof typedObj.finalUntransformedRequest !== 'object' &&
        typeof typedObj.finalUntransformedRequest !== 'function')
    )
      return false;
    if (!('body' in typedObj.finalUntransformedRequest)) return false;

    // originalResponse
    if (
      typedObj.originalResponse == null ||
      (typeof typedObj.originalResponse !== 'object' &&
        typeof typedObj.originalResponse !== 'function')
    )
      return false;
    if (!('body' in typedObj.originalResponse)) return false;

    // createdAt & response
    if (!(typedObj.createdAt instanceof Date)) return false;
    if (!(typedObj.response instanceof Response)) return false;

    // cacheStatus
    if (
      typedObj.cacheStatus !== undefined &&
      typeof typedObj.cacheStatus !== 'string'
    )
      return false;

    // lastUsedOptionIndex
    if (
      typeof typedObj.lastUsedOptionIndex !== 'number' &&
      typeof typedObj.lastUsedOptionIndex !== 'string'
    )
      return false;

    // cacheKey
    if (
      typedObj.cacheKey !== undefined &&
      typeof typedObj.cacheKey !== 'string'
    )
      return false;

    // cacheMode
    if (typeof typedObj.cacheMode !== 'string') return false;

    // cacheMaxAge
    if (
      typedObj.cacheMaxAge !== undefined &&
      typeof typedObj.cacheMaxAge !== 'number'
    )
      return false;

    // hookSpanId
    if (typeof typedObj.hookSpanId !== 'string') return false;

    // executionTime
    if (
      typedObj.executionTime !== undefined &&
      typeof typedObj.executionTime !== 'number'
    )
      return false;

    return true;
  }

  // Final commit that destroys the object
  commit(): void {
    if (this.committed) {
      return; // Already committed, just return silently
    }

    this.committed = true;

    // Destroy the object state to prevent further use
    this.logData = {} as Partial<LogObject>;
  }

  // Check if the object has been committed/destroyed
  isDestroyed(): boolean {
    return this.committed;
  }

  [Symbol.dispose]() {
    this.commit();
  }
}
