import { handler as catoHandler } from './analyze';
import { PluginContext } from '../types';

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  post: jest.fn(),
}));

import * as utils from '../utils';
const mockPost = utils.post as jest.MockedFunction<typeof utils.post>;

const baseChatContext = (): PluginContext => ({
  request: {
    json: {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: 'My SSN is 123-45-6789. Help me draft a memo.',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_employee',
            description: 'Look up employee details by SSN',
            parameters: {
              type: 'object',
              properties: { ssn: { type: 'string' } },
            },
          },
        },
      ],
    },
    headers: { 'x-portkey-trace-id': 'trace-1234' },
  },
  response: {
    json: {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Sure, the SSN was 123-45-6789.',
          },
        },
      ],
    },
  },
  requestType: 'chatComplete',
  provider: 'openai',
  metadata: { traceId: 'trace-1234' },
});

const baseParams = {
  credentials: { apiKey: 'test-key' },
  userEmail: 'user@example.com',
  keyAlias: 'team-alpha',
};

describe('Cato Networks Guardrail', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('returns verdict, data and error fields', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    const result = await catoHandler(
      baseChatContext(),
      baseParams,
      'beforeRequestHook'
    );

    expect(result).toHaveProperty('verdict');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('blocks the request when Cato returns action_type=block_action', async () => {
    mockPost.mockResolvedValue({
      required_action: {
        action_type: 'block_action',
        detection_message: 'Sensitive content detected',
      },
    });

    const result = await catoHandler(
      baseChatContext(),
      baseParams,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toEqual(
      expect.objectContaining({
        required_action: expect.objectContaining({
          action_type: 'block_action',
        }),
      })
    );
    expect(result.error).toBeNull();
  });

  it('passes the request through when Cato returns action_type=monitor_action', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    const result = await catoHandler(
      baseChatContext(),
      baseParams,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(false);
  });

  it('anonymizes the last user message when Cato returns anonymize_action', async () => {
    mockPost.mockResolvedValue({
      required_action: {
        action_type: 'anonymize_action',
        chat_redaction_result: {
          all_redacted_messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            {
              role: 'user',
              content: 'My SSN is [REDACTED]. Help me draft a memo.',
            },
          ],
          redacted_new_message: {
            role: 'user',
            content: 'My SSN is [REDACTED]. Help me draft a memo.',
          },
        },
      },
    });

    const ctx = baseChatContext();
    const result = await catoHandler(ctx, baseParams, 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    const transformedMessages = (result.transformedData as any)?.request?.json
      ?.messages;
    expect(transformedMessages).toBeDefined();
    expect(
      transformedMessages[transformedMessages.length - 1].content
    ).toContain('[REDACTED]');
  });

  it('redacts every message when Cato returns all_redacted_messages', async () => {
    mockPost.mockResolvedValue({
      required_action: {
        action_type: 'anonymize_action',
        chat_redaction_result: {
          all_redacted_messages: [
            { role: 'system', content: 'You are a helpful [REDACTED].' },
            {
              role: 'user',
              content: 'My SSN is [REDACTED]. Help me draft a memo.',
            },
          ],
          redacted_new_message: {
            role: 'user',
            content: 'My SSN is [REDACTED]. Help me draft a memo.',
          },
        },
      },
    });

    const ctx = baseChatContext();
    const result = await catoHandler(ctx, baseParams, 'beforeRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    const messages = (result.transformedData as any)?.request?.json?.messages;
    expect(messages[0].content).toBe('You are a helpful [REDACTED].');
    expect(messages[1].content).toBe(
      'My SSN is [REDACTED]. Help me draft a memo.'
    );
  });

  it('redacts the Anthropic top-level system field across message positions', async () => {
    mockPost.mockResolvedValue({
      required_action: {
        action_type: 'anonymize_action',
        chat_redaction_result: {
          all_redacted_messages: [
            { role: 'system', content: 'Be helpful to [REDACTED].' },
            { role: 'user', content: 'My name is [REDACTED].' },
          ],
          redacted_new_message: {
            role: 'user',
            content: 'My name is [REDACTED].',
          },
        },
      },
    });

    const ctx: PluginContext = {
      request: {
        json: {
          system: 'Be helpful to Alice.',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'My name is Alice.' }],
            },
          ],
        },
        headers: { 'x-portkey-trace-id': 't' },
      },
      response: { json: null },
      requestType: 'messages',
      provider: 'anthropic',
      metadata: {},
    };

    const result = await catoHandler(ctx, baseParams, 'beforeRequestHook');
    const updated = (result.transformedData as any)?.request?.json;
    expect(updated.system).toBe('Be helpful to [REDACTED].');
    expect(updated.messages[0].content[0].text).toBe('My name is [REDACTED].');
  });

  it('anonymizes the response on afterRequestHook', async () => {
    mockPost.mockResolvedValue({
      required_action: {
        action_type: 'anonymize_action',
        chat_redaction_result: {
          all_redacted_messages: [],
          redacted_new_message: {
            role: 'assistant',
            content: 'Sure, the SSN was [REDACTED].',
          },
        },
      },
    });

    const ctx = baseChatContext();
    const result = await catoHandler(ctx, baseParams, 'afterRequestHook');

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    const transformedJson = (result.transformedData as any)?.response?.json;
    expect(transformedJson?.choices?.[0]?.message?.content).toBe(
      'Sure, the SSN was [REDACTED].'
    );
  });

  it('sends the configured headers and bearer token to the analyze endpoint', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(baseChatContext(), baseParams, 'beforeRequestHook');

    const [url, body, options] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.aisec.catonetworks.com/fw/v1/analyze');
    expect((options as any).headers.Authorization).toBe('Bearer test-key');
    expect((options as any).headers['x-cato-call-id']).toBe('trace-1234');
    expect((options as any).headers['x-cato-user-email']).toBe(
      'user@example.com'
    );
    expect((options as any).headers['x-cato-gateway-key-alias']).toBe(
      'team-alpha'
    );
    expect((body as any).messages).toHaveLength(2);
  });

  it('sends content as [{type,text}] blocks in the analyze request', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(baseChatContext(), baseParams, 'beforeRequestHook');

    const [, body] = mockPost.mock.calls[0];
    const messages = (body as any).messages;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'You are a helpful assistant.' },
    ]);
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toEqual([
      { type: 'text', text: 'My SSN is 123-45-6789. Help me draft a memo.' },
    ]);
  });

  it('marks history messages with is_context=true and last as the new message', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(baseChatContext(), baseParams, 'beforeRequestHook');

    const [, body] = mockPost.mock.calls[0];
    const messages = (body as any).messages;
    expect(messages[0].is_context).toBe(true);
    expect(messages[messages.length - 1].is_context).toBeUndefined();
  });

  it('forwards tools field on the analyze request', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(baseChatContext(), baseParams, 'beforeRequestHook');

    const [, body] = mockPost.mock.calls[0];
    expect((body as any).tools).toHaveLength(1);
    expect((body as any).tools[0].function.name).toBe('lookup_employee');
  });

  it('appends the assistant response as a message on afterRequestHook and still sends tools', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(baseChatContext(), baseParams, 'afterRequestHook');

    const [, body] = mockPost.mock.calls[0];
    const messages = (body as any).messages;
    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toEqual([
      { type: 'text', text: 'Sure, the SSN was 123-45-6789.' },
    ]);
    expect(messages[2].is_context).toBeUndefined();
    expect(messages[1].is_context).toBe(true);
    expect((body as any).tools).toHaveLength(1);
  });

  it('serializes assistant tool_calls when present in the response', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    const ctx = baseChatContext();
    ctx.response.json = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'lookup_employee',
                  arguments: '{"ssn":"123-45-6789"}',
                },
              },
            ],
          },
        },
      ],
    };

    await catoHandler(ctx, baseParams, 'afterRequestHook');

    const [, body] = mockPost.mock.calls[0];
    const last = (body as any).messages.slice(-1)[0];
    expect(last.role).toBe('assistant');
    expect(last.tool_calls).toEqual([
      {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'lookup_employee',
          arguments: '{"ssn":"123-45-6789"}',
        },
      },
    ]);
  });

  it('converts Anthropic messages request to OpenAI-style content blocks', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    const ctx: PluginContext = {
      request: {
        json: {
          system: 'You are helpful.',
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Look up my account.' }],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool_use',
                  id: 'tu_1',
                  name: 'lookup',
                  input: { id: 1 },
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tu_1',
                  content: 'Account found',
                },
              ],
            },
          ],
          tools: [{ name: 'lookup', description: 'Look up', input_schema: {} }],
        },
        headers: { 'x-portkey-trace-id': 't' },
      },
      response: { json: null },
      requestType: 'messages',
      provider: 'anthropic',
      metadata: {},
    };

    await catoHandler(ctx, baseParams, 'beforeRequestHook');

    const [, body] = mockPost.mock.calls[0];
    const messages = (body as any).messages;
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: 'system',
        content: [{ type: 'text', text: 'You are helpful.' }],
        is_context: true,
      })
    );
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toEqual([
      { type: 'text', text: 'Look up my account.' },
    ]);
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].tool_calls[0]).toEqual({
      id: 'tu_1',
      type: 'function',
      function: { name: 'lookup', arguments: '{"id":1}' },
    });
    expect(messages[3].role).toBe('tool');
    expect(messages[3].tool_call_id).toBe('tu_1');
    expect((body as any).tools).toEqual([
      { name: 'lookup', description: 'Look up', input_schema: {} },
    ]);
  });

  it('honors a custom apiBase when provided in credentials', async () => {
    mockPost.mockResolvedValue({
      required_action: { action_type: 'monitor_action' },
    });

    await catoHandler(
      baseChatContext(),
      {
        ...baseParams,
        credentials: {
          apiKey: 'test-key',
          apiBase: 'https://custom.cato.example.com/',
        },
      },
      'beforeRequestHook'
    );

    const [url] = mockPost.mock.calls[0];
    expect(url).toBe('https://custom.cato.example.com/fw/v1/analyze');
  });

  it('returns verdict=true with an error when the API key is missing and does not call Cato', async () => {
    const originalEnvKey = process.env.CATO_API_KEY;
    delete process.env.CATO_API_KEY;

    const result = await catoHandler(
      baseChatContext(),
      { credentials: {} },
      'beforeRequestHook'
    );

    if (originalEnvKey !== undefined) {
      process.env.CATO_API_KEY = originalEnvKey;
    }

    expect(result.verdict).toBe(true);
    expect(result.error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('Cato API key is required'),
      })
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('fails open (verdict=true) when Cato API call throws a network error', async () => {
    const networkError = new Error('Network timeout');
    mockPost.mockRejectedValue(networkError);

    const result = await catoHandler(
      baseChatContext(),
      baseParams,
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBe(networkError);
    expect(result.data).toBeNull();
  });

  it('fails closed (verdict=false) on comm errors when failOpen=false', async () => {
    const networkError = new Error('Network timeout');
    mockPost.mockRejectedValue(networkError);

    const result = await catoHandler(
      baseChatContext(),
      { ...baseParams, failOpen: false },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.error).toBe(networkError);
    expect(result.data).toBeNull();
  });

  it('fails open when failOpen=true is set explicitly', async () => {
    const networkError = new Error('Network timeout');
    mockPost.mockRejectedValue(networkError);

    const result = await catoHandler(
      baseChatContext(),
      { ...baseParams, failOpen: true },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.error).toBe(networkError);
  });
});
