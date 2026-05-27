import { PluginContext } from '../types';
import { handler } from './scan';

const buildContext = (toolCalls: unknown[]): PluginContext => ({
  requestType: 'chatComplete',
  request: {
    json: {
      messages: [{ role: 'user', content: 'issue a refund' }],
    },
  },
  response: {
    json: {
      choices: [
        {
          message: {
            tool_calls: toolCalls,
          },
        },
      ],
    },
  },
});

describe('tool payload firewall plugin', () => {
  it('blocks configured tool argument paths on afterRequestHook', async () => {
    const result = await handler(
      buildContext([
        {
          id: 'call_1',
          function: {
            name: 'update_customer',
            arguments: JSON.stringify({
              customer: {
                email: 'a@example.com',
                ssn: '111-22-3333',
              },
            }),
          },
        },
      ]),
      { blockedPaths: ['customer.ssn'] },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data.findings).toEqual([
      expect.objectContaining({
        toolName: 'update_customer',
        path: 'customer.ssn',
        reason: 'blocked_path',
      }),
    ]);
  });

  it('supports wildcard blocked paths for nested payload policies', async () => {
    const result = await handler(
      buildContext([
        {
          function: {
            name: 'send_messages',
            arguments: JSON.stringify({
              recipients: [{ email: 'user@example.com' }],
            }),
          },
        },
      ]),
      { blockedPaths: ['recipients.*.email'] },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data.findings[0]).toEqual(
      expect.objectContaining({
        path: 'recipients.0.email',
        reason: 'blocked_path',
      })
    );
  });

  it('flags large arrays that could trigger mass updates', async () => {
    const result = await handler(
      buildContext([
        {
          function: {
            name: 'bulk_update',
            arguments: JSON.stringify({
              account_ids: ['a', 'b', 'c'],
            }),
          },
        },
      ]),
      { maxArrayItems: 2 },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data.findings[0]).toEqual(
      expect.objectContaining({
        path: 'account_ids',
        reason: 'array_too_large',
      })
    );
  });

  it('passes when no tool call violates the policy', async () => {
    const result = await handler(
      buildContext([
        {
          function: {
            name: 'lookup_customer',
            arguments: JSON.stringify({ customer_id: 'cus_123' }),
          },
        },
      ]),
      {
        allowedToolNames: ['lookup_customer'],
        blockedPaths: ['customer.ssn'],
      },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.data.findings).toEqual([]);
  });
});
