import type { Params } from '../../types/requestBody';
import { BedrockConverseMessagesStreamChunkTransform } from './messages';
import type { BedrockStreamState } from './types';

jest.mock('./chatComplete', () => ({
  BedrockErrorResponseTransform: jest.fn(),
}));

describe('BedrockConverseMessagesStreamChunkTransform', () => {
  it('emits an Anthropic error event when Bedrock reports an in-stream error', () => {
    const streamState: BedrockStreamState = {};
    const gatewayRequest = {
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    } as Params;

    const contentEvent = BedrockConverseMessagesStreamChunkTransform(
      JSON.stringify({
        contentBlockIndex: 0,
        delta: { text: 'Hello' },
      }),
      'fallback-id',
      streamState,
      false,
      gatewayRequest
    );

    expect(contentEvent).toBe(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      })}\n\nevent: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello',
        },
      })}\n\n`
    );
    expect(streamState).toEqual({ currentContentBlockIndex: 0 });

    const message =
      'The model returned the following errors: Could not process image';
    const errorEvent = BedrockConverseMessagesStreamChunkTransform(
      JSON.stringify({ message }),
      'fallback-id',
      streamState,
      false,
      gatewayRequest
    );

    expect(errorEvent).toBe(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: {
          type: 'api_error',
          message,
        },
      })}\n\n`
    );
    expect(streamState).toEqual({ currentContentBlockIndex: 0 });
  });
});
