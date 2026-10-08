import { getBedrockMessagesErrorEvent } from './messagesUtils';

describe('getBedrockMessagesErrorEvent', () => {
  it('converts a Bedrock exception message into an Anthropic error event', () => {
    const message =
      'The model returned the following errors: Could not process image';

    expect(getBedrockMessagesErrorEvent(message)).toBe(
      `event: error\ndata: ${JSON.stringify({
        type: 'error',
        error: {
          type: 'api_error',
          message,
        },
      })}\n\n`
    );
  });
});
