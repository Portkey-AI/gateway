export type AnthropicStreamState = {
  toolIndex?: number;
  usage?: {
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
    completion_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
};

export interface AnthropicErrorObject {
  type: string;
  message: string;
}

export interface AnthropicErrorResponse {
  type: string;
  error: AnthropicErrorObject;
}

// https://docs.anthropic.com/en/api/messages#response-stop-reason
export enum ANTHROPIC_STOP_REASON {
  max_tokens = 'max_tokens',
  stop_sequence = 'stop_sequence',
  tool_use = 'tool_use',
  end_turn = 'end_turn',
  pause_turn = 'pause_turn',
}
