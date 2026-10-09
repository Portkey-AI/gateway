import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import {
  BedrockAnthropicInvokeMessagesConfig,
  BedrockAnthropicInvokeMessagesResponseTransform,
  BedrockAnthropicInvokeMessagesStreamChunkTransform,
} from './messages';

/**
 * Covers the InvokeModel-native request/response/stream handling for
 * Claude's Messages API on Bedrock. Unlike the Converse-shaped config,
 * this is close to a passthrough of Anthropic's own Messages wire
 * format, since InvokeModel accepts and returns that format almost
 * verbatim (plus a required `anthropic_version`).
 */
describe('BedrockAnthropicInvokeMessagesConfig', () => {
  it('passes messages, max_tokens and system through unchanged', () => {
    const params = {
      model: 'anthropic.claude-opus-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1024,
      system: 'be helpful',
    };
    const transformed = transformUsingProviderConfig(
      BedrockAnthropicInvokeMessagesConfig,
      params as any,
      {} as any
    );
    expect(transformed.messages).toEqual(params.messages);
    expect(transformed.max_tokens).toBe(1024);
    expect(transformed.system).toBe('be helpful');
    // model is not part of the InvokeModel body - it's in the request path
    expect(transformed.model).toBeUndefined();
  });

  it('defaults anthropic_version to the Bedrock Anthropic version when not supplied', () => {
    const params = {
      model: 'anthropic.claude-opus-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1024,
    };
    const transformed = transformUsingProviderConfig(
      BedrockAnthropicInvokeMessagesConfig,
      params as any,
      {} as any
    );
    expect(transformed.anthropic_version).toBe('bedrock-2023-05-31');
  });

  it('passes through tools, tool_choice and thinking unchanged', () => {
    const params = {
      model: 'anthropic.claude-opus-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1024,
      tools: [{ name: 'get_weather', input_schema: { type: 'object' } }],
      tool_choice: { type: 'tool', name: 'get_weather' },
      thinking: { type: 'adaptive' },
    };
    const transformed = transformUsingProviderConfig(
      BedrockAnthropicInvokeMessagesConfig,
      params as any,
      {} as any
    );
    expect(transformed.tools).toEqual(params.tools);
    expect(transformed.tool_choice).toEqual(params.tool_choice);
    expect(transformed.thinking).toEqual(params.thinking);
  });
});

describe('BedrockAnthropicInvokeMessagesResponseTransform', () => {
  it('passes through a native Anthropic message response unchanged', () => {
    const response = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const result = BedrockAnthropicInvokeMessagesResponseTransform(
      response as any,
      200
    );
    expect(result).toBe(response);
  });

  it('transforms a Bedrock error response', () => {
    const response = { message: 'The provided model identifier is invalid.' };
    const result = BedrockAnthropicInvokeMessagesResponseTransform(
      response as any,
      400
    );
    expect(result).toHaveProperty('error');
  });
});

describe('BedrockAnthropicInvokeMessagesStreamChunkTransform', () => {
  it('re-wraps a decoded message_start payload as an SSE frame', () => {
    const payload = JSON.stringify({
      type: 'message_start',
      message: { id: 'msg_123', model: 'claude-opus-5' },
    });
    const result = BedrockAnthropicInvokeMessagesStreamChunkTransform(payload);
    expect(result).toBe(`event: message_start\ndata: ${payload}\n\n`);
  });

  it('passes through ping events instead of dropping them', () => {
    const payload = JSON.stringify({ type: 'ping' });
    const result = BedrockAnthropicInvokeMessagesStreamChunkTransform(payload);
    expect(result).toBe(`event: ping\ndata: ${payload}\n\n`);
  });

  it('re-wraps a content_block_delta payload as an SSE frame', () => {
    const payload = JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'hi' },
    });
    const result = BedrockAnthropicInvokeMessagesStreamChunkTransform(payload);
    expect(result).toBe(`event: content_block_delta\ndata: ${payload}\n\n`);
  });

  it('returns undefined for a payload with no type', () => {
    const payload = JSON.stringify({ foo: 'bar' });
    expect(
      BedrockAnthropicInvokeMessagesStreamChunkTransform(payload)
    ).toBeUndefined();
  });
});
