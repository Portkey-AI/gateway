export interface PluginContext {
  [key: string]: any;
  requestType?:
    | 'complete'
    | 'chatComplete'
    | 'embed'
    | 'createBatch'
    | 'createFinetune'
    | 'messages';
  provider?: string;
  metadata?: Record<string, string>;
}

export interface PluginParameters<T = Record<string, string>> {
  [key: string]: any;
  credentials?: T;
}

export interface PluginHandlerResponse {
  error: any;
  verdict?: boolean;
  // The data object can be any JSON object or null.
  data?: any | null;
  transformedData?: any;
  transformed?: boolean;
}

export type HookEventType = 'beforeRequestHook' | 'afterRequestHook';

export type PluginHandlerOptions = {
  env: Record<string, any>;
  getFromCacheByKey: (key: string) => Promise<any>;
  putInCacheWithValue: (
    key: string,
    value: any,
    expiry?: number
  ) => Promise<any>;
  internalServiceFetch: (
    url: string,
    options?: RequestInit
  ) => Promise<Response>;
  externalServiceFetch: (
    url: string,
    options?: RequestInit
  ) => Promise<Response>;
};

export type PluginHandler<T = Record<string, string>> = (
  context: PluginContext,
  parameters: PluginParameters<T>,
  eventType: HookEventType,
  options: PluginHandlerOptions
) => Promise<PluginHandlerResponse>;
