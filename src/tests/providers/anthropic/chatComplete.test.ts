// Mock env.ts and hono/adapter early — they use top-level await / CF Worker
// APIs that aren't available in Jest's Node CommonJS environment.
jest.mock('../../../utils/env', () => ({
  Environment: jest.fn(() => ({})),
  getValueOrFileContents: jest.fn((v: string) => v),
}));
jest.mock('hono/adapter', () => ({
  env: jest.fn(() => ({})),
  getRuntimeKey: jest.fn(() => 'node'),
}));

import {
  AnthropicChatCompleteConfig,
  getAnthropicChatCompleteResponseTransform,
  getAnthropicStreamChunkTransform,
} from '../../../providers/anthropic/chatComplete';
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { AnthropicStreamState } from '../../../providers/anthropic/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseMessages = [{ role: 'user', content: 'hi' }];
const providerOptions = { provider: 'anthropic' } as any;

function makeAnthropicResponse(usageOverrides: Record<string, any> = {}) {
  return {
    id: 'msg_test123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    stop_reason: 'end_turn' as const,
    model: 'claude-opus-4-6',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      ...usageOverrides,
    },
  };
}

function buildStreamEvent(eventName: string, data: object): string {
  return [`event: ${eventName}`, `data: ${JSON.stringify(data)}`].join('\n');
}

function parseChunkData(raw: string): any {
  const line = raw.trim().replace(/^data: /, '');
  return JSON.parse(line);
}

// ---------------------------------------------------------------------------
// 1. Request transform — service_tier forwarded raw to Anthropic
// ---------------------------------------------------------------------------

describe('AnthropicChatCompleteConfig — service_tier request forwarding', () => {
  it('forwards service_tier: "auto" unchanged', () => {
    const params = {
      model: 'claude-opus-4-6',
      messages: baseMessages,
      max_tokens: 64,
      service_tier: 'auto',
    } as any;

    const result = transformUsingProviderConfig(
      AnthropicChatCompleteConfig,
      params,
      providerOptions
    );

    expect(result.service_tier).toBe('auto');
  });

  it('forwards service_tier: "standard_only" unchanged', () => {
    const params = {
      model: 'claude-opus-4-6',
      messages: baseMessages,
      max_tokens: 64,
      service_tier: 'standard_only',
    } as any;

    const result = transformUsingProviderConfig(
      AnthropicChatCompleteConfig,
      params,
      providerOptions
    );

    expect(result.service_tier).toBe('standard_only');
  });

  it('omits service_tier key entirely when not provided', () => {
    const params = {
      model: 'claude-opus-4-6',
      messages: baseMessages,
      max_tokens: 64,
    } as any;

    const result = transformUsingProviderConfig(
      AnthropicChatCompleteConfig,
      params,
      providerOptions
    );

    expect('service_tier' in result).toBe(false);
  });

  it('does NOT rename service_tier to "speed" or any other key', () => {
    const params = {
      model: 'claude-opus-4-6',
      messages: baseMessages,
      max_tokens: 64,
      service_tier: 'auto',
    } as any;

    const result = transformUsingProviderConfig(
      AnthropicChatCompleteConfig,
      params,
      providerOptions
    );

    expect('speed' in result).toBe(false);
    expect(result.service_tier).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// 2. Non-streaming response transform — usage.service_tier surfaced
// ---------------------------------------------------------------------------

describe('AnthropicChatCompleteResponseTransform — usage.service_tier', () => {
  const transform = getAnthropicChatCompleteResponseTransform('anthropic');

  it('includes service_tier: "priority" in response usage', () => {
    const response = makeAnthropicResponse({ service_tier: 'priority' });
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect(result.usage.service_tier).toBe('priority');
  });

  it('includes service_tier: "standard" in response usage', () => {
    const response = makeAnthropicResponse({ service_tier: 'standard' });
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect(result.usage.service_tier).toBe('standard');
  });

  it('includes service_tier: "batch" in response usage', () => {
    const response = makeAnthropicResponse({ service_tier: 'batch' });
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect(result.usage.service_tier).toBe('batch');
  });

  it('omits service_tier key when Anthropic returns null', () => {
    const response = makeAnthropicResponse({ service_tier: null });
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect('service_tier' in result.usage).toBe(false);
  });

  it('omits service_tier key when Anthropic omits it', () => {
    const response = makeAnthropicResponse(); // no service_tier key
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect('service_tier' in result.usage).toBe(false);
  });

  it('still produces correct token counts alongside service_tier', () => {
    const response = makeAnthropicResponse({ service_tier: 'priority' });
    const result = transform(response as any, 200, new Headers(), true) as any;

    expect(result.usage.prompt_tokens).toBe(10);
    expect(result.usage.completion_tokens).toBe(5);
    expect(result.usage.total_tokens).toBe(15);
    expect(result.usage.service_tier).toBe('priority');
  });
});

// ---------------------------------------------------------------------------
// 3. Streaming response transform — service_tier captured and forwarded
// ---------------------------------------------------------------------------

describe('AnthropicStreamChunkTransform — service_tier in streaming', () => {
  const transform = getAnthropicStreamChunkTransform('anthropic');

  it('captures service_tier from message_start and emits it in the final message_delta chunk', () => {
    const streamState: AnthropicStreamState = {};

    // Step 1: message_start carries service_tier in usage
    const startEvent = buildStreamEvent('message_start', {
      type: 'message_start',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 12, service_tier: 'priority' },
      },
    });
    transform(startEvent, 'fallback-id', streamState, true);

    expect(streamState.usage?.service_tier).toBe('priority');

    // Step 2: message_delta is the final chunk — should include service_tier
    const deltaEvent = buildStreamEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 24 },
    });
    const finalRaw = transform(deltaEvent, 'fallback-id', streamState, true);

    expect(finalRaw).toBeDefined();
    const finalChunk = parseChunkData(finalRaw as string);
    expect(finalChunk.usage.service_tier).toBe('priority');
  });

  it('does NOT include service_tier in the final chunk when message_start had none', () => {
    const streamState: AnthropicStreamState = {};

    const startEvent = buildStreamEvent('message_start', {
      type: 'message_start',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 12 }, // no service_tier
      },
    });
    transform(startEvent, 'fallback-id', streamState, true);
    expect(streamState.usage?.service_tier).toBeUndefined();

    const deltaEvent = buildStreamEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 24 },
    });
    const finalRaw = transform(deltaEvent, 'fallback-id', streamState, true);
    const finalChunk = parseChunkData(finalRaw as string);

    expect('service_tier' in finalChunk.usage).toBe(false);
  });

  it('handles service_tier: "standard" in streaming correctly', () => {
    const streamState: AnthropicStreamState = {};

    const startEvent = buildStreamEvent('message_start', {
      type: 'message_start',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 8, service_tier: 'standard' },
      },
    });
    transform(startEvent, 'fallback-id', streamState, true);

    const deltaEvent = buildStreamEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 12 },
    });
    const finalRaw = transform(deltaEvent, 'fallback-id', streamState, true);
    const finalChunk = parseChunkData(finalRaw as string);

    expect(finalChunk.usage.service_tier).toBe('standard');
  });

  it('correctly accumulates token totals alongside service_tier in the final chunk', () => {
    const streamState: AnthropicStreamState = {};

    transform(
      buildStreamEvent('message_start', {
        type: 'message_start',
        message: {
          model: 'claude-opus-4-6',
          usage: { input_tokens: 20, service_tier: 'priority' },
        },
      }),
      'fallback-id',
      streamState,
      true
    );

    const finalRaw = transform(
      buildStreamEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 30 },
      }),
      'fallback-id',
      streamState,
      true
    );

    const finalChunk = parseChunkData(finalRaw as string);
    expect(finalChunk.usage.prompt_tokens).toBe(20);
    expect(finalChunk.usage.completion_tokens).toBe(30);
    expect(finalChunk.usage.total_tokens).toBe(50);
    expect(finalChunk.usage.service_tier).toBe('priority');
  });
});
