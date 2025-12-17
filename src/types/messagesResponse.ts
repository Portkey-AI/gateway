export interface CitationCharLocation {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_char_index: number;

  start_char_index: number;

  type: 'char_location';
}

export interface CitationPageLocation {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_page_number: number;

  start_page_number: number;

  type: 'page_location';
}

export interface CitationContentBlockLocation {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_block_index: number;

  start_block_index: number;

  type: 'content_block_location';
}

export interface CitationsWebSearchResultLocation {
  cited_text: string;

  encrypted_index: string;

  title: string | null;

  type: 'web_search_result_location';

  url: string;
}

export type TextCitation =
  | CitationCharLocation
  | CitationPageLocation
  | CitationContentBlockLocation
  | CitationsWebSearchResultLocation;

export interface TextBlock {
  /**
   * Citations supporting the text block.
   *
   * The type of citation returned will depend on the type of document being cited.
   * Citing a PDF results in `page_location`, plain text results in `char_location`,
   * and content document results in `content_block_location`.
   */
  citations?: Array<TextCitation> | null;

  text: string;

  type: 'text';
}

/**
 * Indicates the tool was called from within a code execution context.
 * Present when using Programmatic Tool Calling.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface ToolUseCaller {
  /**
   * The type of caller (e.g., "code_execution_20250825").
   */
  type: string;

  /**
   * The ID of the server tool use block that initiated this call.
   */
  tool_id: string;
}

export interface ToolUseBlock {
  id: string;

  input: unknown;

  name: string;

  type: 'tool_use';

  /**
   * Present when this tool was invoked from within a code execution context.
   * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
   */
  caller?: ToolUseCaller;
}

export interface ServerToolUseBlock {
  id: string;

  input: unknown;

  name: 'web_search';

  type: 'server_tool_use';
}

export interface WebSearchToolResultError {
  error_code:
    | 'invalid_tool_input'
    | 'unavailable'
    | 'max_uses_exceeded'
    | 'too_many_requests'
    | 'query_too_long';

  type: 'web_search_tool_result_error';
}

export interface WebSearchResultBlock {
  encrypted_content: string;

  page_age: string | null;

  title: string;

  type: 'web_search_result';

  url: string;
}

export type WebSearchToolResultBlockContent =
  | WebSearchToolResultError
  | Array<WebSearchResultBlock>;

export interface WebSearchToolResultBlock {
  content: WebSearchToolResultBlockContent;

  tool_use_id: string;

  type: 'web_search_tool_result';
}

/**
 * Error codes for code execution tool results.
 */
export type CodeExecutionToolResultErrorCode =
  | 'invalid_tool_input'
  | 'unavailable'
  | 'too_many_requests'
  | 'execution_time_exceeded';

/**
 * Error result from code execution.
 */
export interface CodeExecutionToolResultError {
  error_code: CodeExecutionToolResultErrorCode;

  type: 'code_execution_tool_result_error';
}

/**
 * Output file from code execution.
 */
export interface CodeExecutionOutputBlock {
  file_id: string;

  type: 'code_execution_output';
}

/**
 * Successful result from code execution.
 */
export interface CodeExecutionResultBlock {
  content: Array<CodeExecutionOutputBlock>;

  return_code: number;

  stderr: string;

  stdout: string;

  type: 'code_execution_result';
}

export type CodeExecutionToolResultBlockContent =
  | CodeExecutionToolResultError
  | CodeExecutionResultBlock;

/**
 * Result block from Programmatic Tool Calling code execution.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface CodeExecutionToolResultBlock {
  content: CodeExecutionToolResultBlockContent;

  tool_use_id: string;

  type: 'code_execution_tool_result';
}

export interface ThinkingBlock {
  signature: string;

  thinking: string;

  type: 'thinking';
}

export interface RedactedThinkingBlock {
  data: string;

  type: 'redacted_thinking';
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ServerToolUseBlock
  | WebSearchToolResultBlock
  | CodeExecutionToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock;

export enum ANTHROPIC_STOP_REASON {
  end_turn = 'end_turn',
  max_tokens = 'max_tokens',
  stop_sequence = 'stop_sequence',
  tool_use = 'tool_use',
  pause_turn = 'pause_turn',
  refusal = 'refusal',
}

export interface ServerToolUsage {
  /**
   * The number of web search tool requests.
   */
  web_search_requests: number;
}

export interface Usage {
  /**
   * The number of input tokens used to create the cache entry.
   */
  cache_creation_input_tokens?: number | null;

  /**
   * The number of input tokens read from the cache.
   */
  cache_read_input_tokens?: number | null;

  /**
   * The number of input tokens which were used.
   */
  input_tokens: number;

  /**
   * The number of output tokens which were used.
   */
  output_tokens: number;

  /**
   * The number of server tool requests.
   */
  server_tool_use?: ServerToolUsage | null;

  /**
   * If the request used the priority, standard, or batch tier.
   */
  service_tier?: 'standard' | 'priority' | 'batch' | null;
}

export interface MessagesResponse {
  /**
   * Unique object identifier.
   */
  id: string;

  /**
   * Content generated by the model.
   */
  content: Array<ContentBlock>;

  /**
   * The model that will complete your prompt.
   */
  model: string;

  /**
   * Conversational role of the generated message.
   *
   * This will always be `"assistant"`.
   */
  role: 'assistant';

  /**
   * The reason that we stopped.
   *
   * This may be one the following values:
   *
   * - `"end_turn"`: the model reached a natural stopping point
   * - `"max_tokens"`: we exceeded the requested `max_tokens` or the model's maximum
   * - `"stop_sequence"`: one of your provided custom `stop_sequences` was generated
   * - `"tool_use"`: the model invoked one or more tools
   *
   * In non-streaming mode this value is always non-null. In streaming mode, it is
   * null in the `message_start` event and non-null otherwise.
   */
  stop_reason: ANTHROPIC_STOP_REASON | null;

  /**
   * Which custom stop sequence was generated, if any.
   *
   * This value will be a non-null string if one of your custom stop sequences was
   * generated.
   */
  stop_sequence?: string | null;

  /**
   * Object type.
   *
   * For Messages, this is always `"message"`.
   */
  type: 'message';

  /**
   * Billing and rate-limit usage.
   *
   * Anthropic's API bills and rate-limits by token counts, as tokens represent the
   * underlying cost to our systems.
   *
   * Under the hood, the API transforms requests into a format suitable for the
   * model. The model's output then goes through a parsing stage before becoming an
   * API response. As a result, the token counts in `usage` will not match one-to-one
   * with the exact visible content of an API request or response.
   *
   * For example, `output_tokens` will be non-zero, even for an empty string response
   * from Claude.
   *
   * Total input tokens in a request is the summation of `input_tokens`,
   * `cache_creation_input_tokens`, and `cache_read_input_tokens`.
   */
  usage: Usage;
}
