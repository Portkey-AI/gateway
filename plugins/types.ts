export interface PluginContext {
  [key: string]: any;
  requestType?: 'complete' | 'chatComplete';
  provider?: string;
}

export interface PluginParameters<K = Record<string, string>> {
  [key: string]: any;
  credentials?: K;
}

export interface PluginHandlerResponse {
  error: any;
  verdict?: boolean;
  // The data object can be any JSON object or null.
  data?: any | null;
  transformedData?: any;
}

export type HookEventType = 'beforeRequestHook' | 'afterRequestHook';

export type PluginHandler<P = unknown> = (
  context: PluginContext,
  parameters: PluginParameters<P>,
  eventType: HookEventType,
  options?: {
    env: Record<string, any>;
  }
) => Promise<PluginHandlerResponse>;
