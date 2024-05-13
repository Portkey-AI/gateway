export interface PluginContext {
  [key: string]: any;
}

export interface PluginParameters {
  [key: string]: any;
  credentials?: { [key: string]: string };
}

export interface PluginHandlerResponse {
  error: Error | null;
  verdict?: boolean;
  // The data object can be any JSON object or null.
  data?: {} | null;
}

export type PluginHandler = (
  context: PluginContext,
  parameters: PluginParameters
) => Promise<PluginHandlerResponse>;
