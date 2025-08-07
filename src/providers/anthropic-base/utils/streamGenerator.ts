import {
  MessagesResponse,
  TextBlock,
  TextCitation,
  ThinkingBlock,
  ToolUseBlock,
} from '../../../types/messagesResponse';

const getMessageStartEvent = (response: MessagesResponse): string => {
  const message = { ...response, content: [], type: 'message_start' };
  return `event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message,
  })}\n\n`;
};

const getMessageDeltaEvent = (response: MessagesResponse): string => {
  const messageDeltaEvent = {
    type: 'message_delta',
    delta: {
      stop_reason: response.stop_reason,
      stop_sequence: response.stop_sequence,
    },
    usage: response.usage,
  };
  return `event: message_delta\ndata: ${JSON.stringify(messageDeltaEvent)}\n\n`;
};

const MESSAGE_STOP_EVENT = `event: message_stop\ndata: {"type": "message_stop"}\n\n`;

const textContentBlockStartEvent = (index: number): string => {
  return `event: content_block_start\ndata: ${JSON.stringify({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'text',
      text: '',
    },
  })}\n\n`;
};

const textContentBlockDeltaEvent = (
  index: number,
  textBlock: TextBlock
): string => {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'text_delta',
      text: textBlock.text,
    },
  })}\n\n`;
};

const toolUseContentBlockStartEvent = (
  index: number,
  toolUseBlock: ToolUseBlock
): string => {
  return `event: content_block_start\ndata: ${JSON.stringify({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'tool_use',
      tool_use: { ...toolUseBlock, input: {} },
    },
  })}\n\n`;
};

const toolUseContentBlockDeltaEvent = (
  index: number,
  toolUseBlock: ToolUseBlock
): string => {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'input_json_delta',
      partial_json: JSON.stringify(toolUseBlock.input),
    },
  })}\n\n`;
};

const thinkingContentBlockStartEvent = (index: number): string => {
  return `event: content_block_start\ndata: ${JSON.stringify({
    type: 'content_block_start',
    index,
    content_block: {
      type: 'thinking',
      thinking: '',
      signature: '',
    },
  })}\n\n`;
};

const thinkingContentBlockDeltaEvent = (
  index: number,
  thinkingBlock: ThinkingBlock
): string => {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'thinking_delta',
      thinking: thinkingBlock.thinking,
    },
  })}\n\n`;
};

const signatureContentBlockDeltaEvent = (
  index: number,
  thinkingBlock: ThinkingBlock
): string => {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'signature_delta',
      signature: thinkingBlock.signature,
    },
  })}\n\n`;
};

const citationContentBlockDeltaEvent = (
  index: number,
  citation: TextCitation
): string => {
  return `event: content_block_delta\ndata: ${JSON.stringify({
    type: 'content_block_delta',
    index,
    delta: {
      type: 'citations_delta',
      citation,
    },
  })}\n\n`;
};

const contentBlockStopEvent = (index: number): string => {
  return `event: content_block_stop\ndata: ${JSON.stringify({
    type: 'content_block_stop',
    index,
  })}\n\n`;
};

export function* anthropicMessagesJsonToStreamGenerator(
  response: MessagesResponse
): Generator<string, void, unknown> {
  yield getMessageStartEvent(response);

  for (const [index, contentBlock] of response.content.entries()) {
    switch (contentBlock.type) {
      case 'text':
        yield textContentBlockStartEvent(index);
        yield textContentBlockDeltaEvent(index, contentBlock);
        if (contentBlock.citations) {
          for (const citation of contentBlock.citations) {
            yield citationContentBlockDeltaEvent(index, citation);
          }
        }
        break;
      case 'tool_use':
        yield toolUseContentBlockStartEvent(index, contentBlock);
        yield toolUseContentBlockDeltaEvent(index, contentBlock);
        break;
      case 'thinking':
        yield thinkingContentBlockStartEvent(index);
        yield thinkingContentBlockDeltaEvent(index, contentBlock);
        yield signatureContentBlockDeltaEvent(index, contentBlock);
        break;
    }
    yield contentBlockStopEvent(index);
  }

  yield getMessageDeltaEvent(response);

  yield MESSAGE_STOP_EVENT;
}
