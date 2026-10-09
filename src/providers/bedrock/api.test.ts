import BedrockAPIConfig from './api';

/**
 * Covers the fix for Claude requests to the Bedrock `messages` /
 * `stream-messages` endpoints being routed to Converse instead of
 * InvokeModel. Converse rejects some empty-content assistant messages
 * that Anthropic's own API accepts, has no `ping` keepalive event on long
 * `thinking` streams, and silently drops Anthropic-only tools (computer
 * use, server-side web search) during translation to its own shape.
 *
 * `chatComplete` intentionally keeps using Converse for every model
 * except the legacy Cohere/AI21 invoke models: it has no native-Anthropic
 * equivalent to fall back to, since it is Portkey's OpenAI-shaped
 * chat-completions surface, not Anthropic's Messages surface.
 */
describe('BedrockAPIConfig.getEndpoint', () => {
  const callGetEndpoint = (fn: string, model: string, stream = false) =>
    BedrockAPIConfig.getEndpoint({
      fn: fn as any,
      gatewayRequestBodyJSON: { model, stream } as any,
      gatewayRequestURL: 'https://gateway.example/v1/messages',
    } as any);

  it('routes a Claude messages call to InvokeModel', () => {
    expect(callGetEndpoint('messages', 'anthropic.claude-opus-5')).toBe(
      '/model/anthropic.claude-opus-5/invoke'
    );
  });

  it('routes a Claude messages call via a us. cross-region profile to InvokeModel', () => {
    expect(callGetEndpoint('messages', 'us.anthropic.claude-opus-5')).toBe(
      '/model/us.anthropic.claude-opus-5/invoke'
    );
  });

  it('routes a Claude messages call via a global. cross-region profile to InvokeModel', () => {
    expect(
      callGetEndpoint('messages', 'global.anthropic.claude-sonnet-5-5')
    ).toBe('/model/global.anthropic.claude-sonnet-5-5/invoke');
  });

  it('routes a streaming Claude messages call to the InvokeModel stream endpoint', () => {
    expect(
      callGetEndpoint('messages', 'us.anthropic.claude-opus-5', true)
    ).toBe('/model/us.anthropic.claude-opus-5/invoke-with-response-stream');
  });

  it('still routes a Claude chatComplete call to Converse', () => {
    expect(callGetEndpoint('chatComplete', 'anthropic.claude-opus-5')).toBe(
      '/model/anthropic.claude-opus-5/converse'
    );
  });

  it('still routes a streaming Claude chatComplete call to the Converse stream endpoint', () => {
    expect(
      callGetEndpoint('chatComplete', 'anthropic.claude-opus-5', true)
    ).toBe('/model/anthropic.claude-opus-5/converse-stream');
  });

  it('still routes a legacy Cohere invoke model to InvokeModel for messages', () => {
    expect(callGetEndpoint('messages', 'cohere.command-text-v14')).toBe(
      '/model/cohere.command-text-v14/invoke'
    );
  });

  it('still routes a non-Claude, non-legacy model to Converse for messages', () => {
    expect(callGetEndpoint('messages', 'amazon.titan-text-express-v1')).toBe(
      '/model/amazon.titan-text-express-v1/converse'
    );
  });

  it('still routes a non-Claude model to Converse for chatComplete', () => {
    expect(
      callGetEndpoint('chatComplete', 'meta.llama3-70b-instruct-v1:0')
    ).toBe('/model/meta.llama3-70b-instruct-v1:0/converse');
  });
});
