export * from 'hono';

enum CACHE_STATUS {
  HIT = 'HIT',
  SEMANTIC_HIT = 'SEMANTIC HIT',
  MISS = 'MISS',
  SEMANTIC_MISS = 'SEMANTIC MISS',
  REFRESH = 'REFRESH',
  DISABLED = 'DISABLED',
}

declare module 'hono' {
  interface ContextVariableMap {
    hooksManager: import('./middlewares/hooks').HooksManager;
    executeHooks: ContextVariableMap['hooksManager']['executeHooks'];
    getFromCache: (
      env: any,
      requestHeaders: any,
      requestBody: any,
      url: string,
      organisationId: string,
      cacheMode: string,
      cacheMaxAge?: string | number | null
    ) => Promise<[any, CACHE_STATUS, any]>;
    requestOptions: [
      {
        providerOptions: {
          provider: string;
          requestURL: string;
          rubeusURL: string;
          [key: string]: any;
        };
        requestParams: any;
        response: Response;
        cacheStatus: CACHE_STATUS;
        cacheKey: string;
        cacheMode: string;
        // intentionally undefined
        cacheMaxAge: string | number | null | undefined;
      },
    ];
  }
}
