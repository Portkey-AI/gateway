export interface CacheControlEphemeral {
  type: 'ephemeral';
}

export interface ServerToolUseBlockParam {
  id: string;

  input: unknown;

  name: 'web_search';

  type: 'server_tool_use';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface WebSearchResultBlockParam {
  encrypted_content: string;

  title: string;

  type: 'web_search_result';

  url: string;

  page_age?: string | null;
}

export interface WebSearchToolRequestError {
  error_code:
    | 'invalid_tool_input'
    | 'unavailable'
    | 'max_uses_exceeded'
    | 'too_many_requests'
    | 'query_too_long';

  type: 'web_search_tool_result_error';
}

export type WebSearchToolResultBlockParamContent =
  | Array<WebSearchResultBlockParam>
  | WebSearchToolRequestError;

export interface WebSearchToolResultBlockParam {
  content: WebSearchToolResultBlockParamContent;

  tool_use_id: string;

  type: 'web_search_tool_result';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface CitationCharLocationParam {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_char_index: number;

  start_char_index: number;

  type: 'char_location';
}

export interface CitationPageLocationParam {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_page_number: number;

  start_page_number: number;

  type: 'page_location';
}

export interface CitationContentBlockLocationParam {
  cited_text: string;

  document_index: number;

  document_title: string | null;

  end_block_index: number;

  start_block_index: number;

  type: 'content_block_location';
}

export interface CitationWebSearchResultLocationParam {
  cited_text: string;

  encrypted_index: string;

  title: string | null;

  type: 'web_search_result_location';

  url: string;
}

export type TextCitationParam =
  | CitationCharLocationParam
  | CitationPageLocationParam
  | CitationContentBlockLocationParam
  | CitationWebSearchResultLocationParam;

export interface TextBlockParam {
  text: string;

  type: 'text';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  citations?: Array<TextCitationParam> | null;
}

export interface Base64ImageSource {
  data: string;

  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  type: 'base64';
}

export interface URLImageSource {
  type: 'url';

  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  url: string;
}

export interface FileImageSource {
  type: 'file';

  file_id: string;
}

export interface ImageBlockParam {
  source: Base64ImageSource | URLImageSource | FileImageSource;

  type: 'image';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface ToolUseBlockParam {
  id: string;

  input: unknown;

  name: string;

  type: 'tool_use';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface ToolResultBlockParam {
  tool_use_id: string;

  type: 'tool_result';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  content?: string | Array<TextBlockParam | ImageBlockParam>;

  is_error?: boolean;
}

export interface Base64PDFSource {
  data: string;

  media_type: 'application/pdf';

  type: 'base64';
}

export interface PlainTextSource {
  data: string;

  media_type: 'text/plain';

  type: 'text';
}

export interface ContentBlockSource {
  content: string | Array<ContentBlockSourceContent>;

  type: 'content';
}

export type ContentBlockSourceContent = TextBlockParam | ImageBlockParam;

export interface URLPDFSource {
  type: 'url';

  url: string;

  media_type?: 'application/pdf';
}

export interface CitationsConfigParam {
  enabled?: boolean;
}

export interface DocumentBlockParam {
  source: Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource;

  type: 'document';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  citations?: CitationsConfigParam;

  context?: string | null;

  title?: string | null;
}

export interface ThinkingBlockParam {
  signature: string;

  thinking: string;

  type: 'thinking';
}

export interface RedactedThinkingBlockParam {
  data: string;

  type: 'redacted_thinking';
}

export type BetaCodeExecutionToolResultErrorCode =
  | 'invalid_tool_input'
  | 'unavailable'
  | 'too_many_requests'
  | 'execution_time_exceeded';

export interface BetaCodeExecutionToolResultErrorParam {
  error_code: BetaCodeExecutionToolResultErrorCode;

  type: 'code_execution_tool_result_error';
}

export interface BetaCodeExecutionOutputBlockParam {
  file_id: string;

  type: 'code_execution_output';
}

export interface BetaCodeExecutionResultBlockParam {
  content: Array<BetaCodeExecutionOutputBlockParam>;

  return_code: number;

  stderr: string;

  stdout: string;

  type: 'code_execution_result';
}

export type BetaCodeExecutionToolResultBlockParamContent =
  | BetaCodeExecutionToolResultErrorParam
  | BetaCodeExecutionResultBlockParam;

export interface BetaCodeExecutionToolResultBlockParam {
  content: BetaCodeExecutionToolResultBlockParamContent;

  tool_use_id: string;

  type: 'code_execution_tool_result';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

/**
 * Regular text content.
 */
export type ContentBlockParam =
  | ServerToolUseBlockParam
  | WebSearchToolResultBlockParam
  | TextBlockParam
  | ImageBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam
  | DocumentBlockParam
  | ThinkingBlockParam
  | RedactedThinkingBlockParam
  | BetaCodeExecutionToolResultBlockParam;

export interface MessageParam {
  content: string | Array<ContentBlockParam>;

  role: 'user' | 'assistant';
}

export interface Metadata {
  /**
   * An external identifier for the user who is associated with the request.
   */
  user_id?: string | null;
}

export interface ThinkingConfigEnabled {
  /**
   * Determines how many tokens Claude can use for its internal reasoning process.
   */
  budget_tokens: number;

  type: 'enabled';
}

export interface ThinkingConfigDisabled {
  type: 'disabled';
}

export type ThinkingConfigParam =
  | ThinkingConfigEnabled
  | ThinkingConfigDisabled;

/**
 * The model will use any available tools.
 */
export interface ToolChoiceAny {
  type: 'any';

  /**
   * Whether to disable parallel tool use.
   *
   * Defaults to `false`. If set to `true`, the model will output exactly one tool
   * use.
   */
  disable_parallel_tool_use?: boolean;
}

/**
 * The model will automatically decide whether to use tools.
 */
export interface ToolChoiceAuto {
  type: 'auto';

  /**
   * Whether to disable parallel tool use.
   *
   * Defaults to `false`. If set to `true`, the model will output at most one tool
   * use.
   */
  disable_parallel_tool_use?: boolean;
}

/**
 * The model will not be allowed to use tools.
 */
export interface ToolChoiceNone {
  type: 'none';
}

/**
 * The model will use the specified tool with `tool_choice.name`.
 */
export interface ToolChoiceTool {
  /**
   * The name of the tool to use.
   */
  name: string;

  type: 'tool';

  /**
   * Whether to disable parallel tool use.
   *
   * Defaults to `false`. If set to `true`, the model will output exactly one tool
   * use.
   */
  disable_parallel_tool_use?: boolean;
}

export interface ToolInputSchema {
  type: 'object';

  properties?: unknown | null;

  required?: Array<string> | null;

  [k: string]: unknown;
}

export interface Tool {
  /**
   * [JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.
   *
   * This defines the shape of the `input` that your tool accepts and that the model
   * will produce.
   */
  input_schema: ToolInputSchema;

  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: string;

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  /**
   * Description of what this tool does.
   *
   * Tool descriptions should be as detailed as possible. The more information that
   * the model has about what the tool is and how to use it, the better it will
   * perform. You can use natural language descriptions to reinforce important
   * aspects of the tool input JSON schema.
   */
  description?: string;

  type?: 'custom' | null;

  /**
   * When true, this tool is not loaded into context initially.
   * Claude discovers it via Tool Search Tool on-demand.
   * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
   */
  defer_loading?: boolean;

  /**
   * List of tool types that can call this tool programmatically.
   * E.g., ["code_execution_20250825"] enables Programmatic Tool Calling.
   * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
   */
  allowed_callers?: string[];

  /**
   * Example inputs demonstrating how to use this tool.
   * Helps Claude understand usage patterns beyond JSON schema.
   * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
   */
  input_examples?: Record<string, any>[];
}

export interface ToolBash20250124 {
  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: 'bash';

  type: 'bash_20250124';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface ToolTextEditor20250124 {
  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: 'str_replace_editor';

  type: 'text_editor_20250124';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export interface WebSearchUserLocation {
  type: 'approximate';

  /**
   * The city of the user.
   */
  city?: string | null;

  /**
   * The two letter
   * [ISO country code](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) of the
   * user.
   */
  country?: string | null;

  /**
   * The region of the user.
   */
  region?: string | null;

  /**
   * The [IANA timezone](https://nodatime.org/TimeZones) of the user.
   */
  timezone?: string | null;
}

export interface WebSearchTool20250305 {
  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: 'web_search';

  type: 'web_search_20250305';

  /**
   * If provided, only these domains will be included in results. Cannot be used
   * alongside `blocked_domains`.
   */
  allowed_domains?: Array<string> | null;

  /**
   * If provided, these domains will never appear in results. Cannot be used
   * alongside `allowed_domains`.
   */
  blocked_domains?: Array<string> | null;

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;

  /**
   * Maximum number of times the tool can be used in the API request.
   */
  max_uses?: number | null;

  /**
   * Parameters for the user's location. Used to provide more relevant search
   * results.
   */
  user_location?: WebSearchUserLocation | null;
}

export interface TextEditor20250429 {
  /**
   * Name of the tool.
   *
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: 'str_replace_based_edit_tool';

  type: 'text_editor_20250429';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

/**
 * Tool Search Tool with regex-based search.
 * Enables Claude to discover tools on-demand instead of loading all upfront.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface ToolSearchToolRegex {
  /**
   * Name of the tool search tool.
   */
  name: string;

  type: 'tool_search_tool_regex_20251119';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

/**
 * Tool Search Tool with BM25-based search.
 * Enables Claude to discover tools on-demand instead of loading all upfront.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface ToolSearchToolBM25 {
  /**
   * Name of the tool search tool.
   */
  name: string;

  type: 'tool_search_tool_bm25_20251119';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

/**
 * Code Execution Tool for Programmatic Tool Calling.
 * Allows Claude to invoke tools from within a code execution environment.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface CodeExecutionTool {
  /**
   * Name of the code execution tool.
   */
  name: string;

  type: 'code_execution_20250825';

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

/**
 * Configuration for individual tools within an MCP toolset.
 */
export interface MCPToolConfig {
  /**
   * When true, this tool is not loaded into context initially.
   */
  defer_loading?: boolean;

  /**
   * List of tool types that can call this tool programmatically.
   */
  allowed_callers?: string[];
}

/**
 * MCP Toolset for connecting MCP servers.
 * Allows deferring loading for entire servers while keeping specific tools loaded.
 * Part of Anthropic's advanced tool use beta (advanced-tool-use-2025-11-20).
 */
export interface MCPToolset {
  type: 'mcp_toolset';

  /**
   * Name of the MCP server to connect to.
   */
  mcp_server_name: string;

  /**
   * Default configuration applied to all tools in this MCP server.
   */
  default_config?: MCPToolConfig;

  /**
   * Per-tool configuration overrides, keyed by tool name.
   */
  configs?: Record<string, MCPToolConfig>;

  /**
   * Create a cache control breakpoint at this content block.
   */
  cache_control?: CacheControlEphemeral | null;
}

export type ToolUnion =
  | Tool
  | ToolBash20250124
  | ToolTextEditor20250124
  | TextEditor20250429
  | WebSearchTool20250305
  | ToolSearchToolRegex
  | ToolSearchToolBM25
  | CodeExecutionTool
  | MCPToolset;

/**
 * How the model should use the provided tools. The model can use a specific tool,
 * any available tool, decide by itself, or not use tools at all.
 */
export type ToolChoice =
  | ToolChoiceAuto
  | ToolChoiceAny
  | ToolChoiceTool
  | ToolChoiceNone;

export interface MessageCreateParamsBase {
  /**
   * The maximum number of tokens to generate before stopping.
   */
  max_tokens: number;

  /**
   * Input messages.
   */
  messages: Array<MessageParam>;

  /**
   * The model that will complete your prompt.\n\nSee
   */
  model: string;

  /**
   * An object describing metadata about the request.
   */
  metadata?: Metadata;

  /**
   * Determines whether to use priority capacity (if available) or standard capacity
   */
  service_tier?: 'auto' | 'standard_only';

  /**
   * Custom text sequences that will cause the model to stop generating.
   */
  stop_sequences?: Array<string>;

  /**
   * Whether to incrementally stream the response using server-sent events.
   */
  stream?: boolean;

  /**
   * System prompt.
   */
  system?: string | Array<TextBlockParam>;

  /**
   * Amount of randomness injected into the response.
   */
  temperature?: number;

  /**
   * Configuration for enabling Claude's extended thinking.
   */
  thinking?: ThinkingConfigParam;

  /**
   * How the model should use the provided tools. The model can use a specific tool,
   * any available tool, decide by itself, or not use tools at all.
   */
  tool_choice?: ToolChoice;

  /**
   * Definitions of tools that the model may use.
   */
  tools?: Array<ToolUnion>;

  /**
   * Only sample from the top K options for each subsequent token.
   */
  top_k?: number;

  /**
   * Use nucleus sampling.
   */
  top_p?: number;

  // anthropic specific, maybe move this
  anthropic_beta?: string;
}
