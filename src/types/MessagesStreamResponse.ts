import {
  CitationCharLocation,
  CitationContentBlockLocation,
  CitationPageLocation,
  CitationsWebSearchResultLocation,
  MessagesResponse,
  RedactedThinkingBlock,
  ServerToolUseBlock,
  ANTHROPIC_STOP_REASON,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  Usage,
  WebSearchToolResultBlock,
} from './messagesResponse';

export interface RawMessageErrorEvent {
  error: {
    details: string;
    type: string;
    message: string;
  };
  type: 'error';
  request_id: string;
}

export interface RawMessageStartEvent {
  message: MessagesResponse;

  type: 'message_start';
}

export interface RawMessageDelta {
  stop_reason: ANTHROPIC_STOP_REASON | null;

  stop_sequence: string | null;
}

export interface RawMessageDeltaEvent {
  delta: RawMessageDelta;

  type: 'message_delta';

  /**
   * Billing and rate-limit usage.
   */
  usage: Usage;
}

export interface RawMessageStopEvent {
  type: 'message_stop';
}

export interface RawContentBlockStartEvent {
  content_block:
    | TextBlock
    | ToolUseBlock
    | ServerToolUseBlock
    | WebSearchToolResultBlock
    | ThinkingBlock
    | RedactedThinkingBlock;

  index: number;

  type: 'content_block_start';
}

export interface TextDelta {
  text: string;

  type: 'text_delta';
}

export interface InputJSONDelta {
  partial_json: string;

  type: 'input_json_delta';
}

export interface CitationsDelta {
  citation:
    | CitationCharLocation
    | CitationPageLocation
    | CitationContentBlockLocation
    | CitationsWebSearchResultLocation;

  type: 'citations_delta';
}

export interface ThinkingDelta {
  thinking: string;

  type: 'thinking_delta';
}

export interface SignatureDelta {
  signature: string;

  type: 'signature_delta';
}

export interface RedactedThinkingDelta {
  data: string;

  type: 'redacted_thinking_delta';
}

export type RawContentBlockDelta =
  | TextDelta
  | InputJSONDelta
  | CitationsDelta
  | ThinkingDelta
  | SignatureDelta;

export interface RawContentBlockDeltaEvent {
  delta: RawContentBlockDelta;

  index: number;

  type: 'content_block_delta';
}

export interface RawContentBlockStopEvent {
  index: number;

  type: 'content_block_stop';
}

export interface RawPingEvent {
  type: 'ping';
}

export type RawMessageStreamEvent =
  | RawMessageStartEvent
  | RawMessageErrorEvent
  | RawMessageDeltaEvent
  | RawMessageStopEvent
  | RawContentBlockStartEvent
  | RawContentBlockDeltaEvent
  | RawContentBlockStopEvent
  | RawPingEvent;
