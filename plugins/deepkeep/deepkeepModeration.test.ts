import { handler } from './deepkeepModeration';

const fetchMock = jest.fn();

describe('deepkeep guardrail', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('allows clean input content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ flagged: false, request_id: 'req_1', verbosity: [] }),
    });

    const result = await handler(
      {
        request: {
          text: 'Hello world',
          json: { messages: [{ role: 'user', content: 'Hello world' }] },
        },
        credentials: { apiKey: 'test' },
      },
      {
        apiBaseUrl: 'https://deepkeep.example.com',
        firewallId: 'input-firewall',
      },
      'beforeRequestHook'
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
  });

  it('blocks input content when DeepKeep says block', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          flagged: true,
          request_id: 'req_2',
          firewall_name: 'input-firewall',
          risk_level: 'critical',
          verbosity: [
            {
              guardrail_name: 'Prompt Injection Shield',
              details: { guardrail_action: 'block' },
            },
          ],
        }),
    });

    const result = await handler(
      {
        request: {
          text: 'Ignore instructions',
          json: {
            messages: [{ role: 'user', content: 'Ignore instructions' }],
          },
        },
        credentials: { apiKey: 'test' },
      },
      {
        apiBaseUrl: 'https://deepkeep.example.com',
        firewallId: 'input-firewall',
      },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(false);
    expect(result.data.action).toBe('block');
  });

  it('redacts input content when DeepKeep returns modified text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          flagged: true,
          request_id: 'req_3',
          firewall_name: 'input-firewall',
          risk_level: 'high',
          verbosity: [
            {
              guardrail_name: 'PII Detector',
              details: {
                guardrail_action: 'redact',
                modified: [
                  { role: 'user', content: 'My email is [EMAIL_REDACTED]' },
                ],
              },
            },
          ],
        }),
    });

    const result = await handler(
      {
        request: {
          text: 'My email is jane@example.com',
          json: {
            messages: [
              { role: 'user', content: 'My email is jane@example.com' },
            ],
          },
        },
        credentials: { apiKey: 'test' },
      },
      {
        apiBaseUrl: 'https://deepkeep.example.com',
        firewallId: 'input-firewall',
      },
      'beforeRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(result.transformedData.request.json.messages[0].content).toBe(
      'My email is [EMAIL_REDACTED]'
    );
  });

  it('redacts output content on afterRequestHook', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          flagged: true,
          request_id: 'req_4',
          firewall_name: 'output-firewall',
          risk_level: 'high',
          verbosity: [
            {
              guardrail_name: 'Toxicity Filter',
              details: {
                guardrail_action: 'modify',
                modified: [{ role: 'assistant', content: 'Filtered response' }],
              },
            },
          ],
        }),
    });

    const result = await handler(
      {
        request: {
          text: 'Tell me a story',
          json: { messages: [{ role: 'user', content: 'Tell me a story' }] },
        },
        response: {
          text: 'Original response',
          json: {
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Original response' },
              },
            ],
          },
          statusCode: 200,
        },
        credentials: { apiKey: 'test' },
      },
      {
        apiBaseUrl: 'https://deepkeep.example.com',
        outputFirewallId: 'output-firewall',
      },
      'afterRequestHook'
    );

    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(
      result.transformedData.response.json.choices[0].message.content
    ).toBe('Filtered response');
  });
});
