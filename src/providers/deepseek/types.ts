/**
 * Represents a tool call made by the DeepSeek model
 * @interface
 */
export interface ToolCall {
  /** The unique identifier for this tool call */
  id: string;
  /** The type of tool call, always 'function' for DeepSeek */
  type: 'function';
  /** The function to be called */
  function: {
    /** The name of the function to call */
    name: string;
    /** JSON string containing the arguments to pass to the function */
    arguments: string;
  };
}

export enum DEEPSEEK_STOP_REASON {
  stop = 'stop',
  length = 'length',
  tool_calls = 'tool_calls',
  content_filter = 'content_filter',
  insufficient_system_resource = 'insufficient_system_resource',
}
