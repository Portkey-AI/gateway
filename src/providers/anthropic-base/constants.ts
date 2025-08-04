export const ANTHROPIC_MESSAGE_START_EVENT = JSON.stringify({
  type: 'message_start',
  message: {
    id: '',
    type: 'message',
    role: 'assistant',
    model: '',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
    },
  },
});

export const ANTHROPIC_MESSAGE_DELTA_EVENT = JSON.stringify({
  type: 'message_delta',
  delta: {
    stop_reason: '',
    stop_sequence: null,
  },
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
});

export const ANTHROPIC_MESSAGE_STOP_EVENT = {
  type: 'message_stop',
};

export const ANTHROPIC_CONTENT_BLOCK_STOP_EVENT = JSON.stringify({
  type: 'content_block_stop',
  index: 0,
});

export const ANTHROPIC_CONTENT_BLOCK_START_EVENT = JSON.stringify({
  type: 'content_block_start',
  index: 1,
  // handle other content block types here
  content_block: {
    type: 'text',
    text: '',
  },
});
