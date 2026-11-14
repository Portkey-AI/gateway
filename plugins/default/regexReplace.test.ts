import { PluginContext } from '../types';
import { handler } from './regexReplace';

const parameters = {
  rule: 'EXAMPLE_PRIVATE_VALUE',
  redactText: '[REDACTED]',
};

describe('regexReplace messages responses', () => {
  test('preserves typed text blocks and their metadata', async () => {
    const context: PluginContext = {
      requestType: 'messages',
      response: {
        json: {
          content: [
            { type: 'text', text: 'EXAMPLE_PRIVATE_VALUE', citations: [] },
          ],
        },
      },
    };

    const result = await handler(context, parameters, 'afterRequestHook');

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.transformed).toBe(true);
    expect(result.transformedData.response.json.content).toEqual([
      { type: 'text', text: '[REDACTED]', citations: [] },
    ]);
  });

  test('preserves interleaved tool blocks and text alignment', async () => {
    const tool = {
      type: 'tool_use',
      id: 'EXAMPLE_TOOL_ID',
      name: 'quote',
      input: { symbol: 'EXAMPLE' },
    };
    const context: PluginContext = {
      requestType: 'messages',
      response: {
        json: {
          content: [tool, { type: 'text', text: 'EXAMPLE_PRIVATE_VALUE' }],
        },
      },
    };

    const result = await handler(context, parameters, 'afterRequestHook');

    expect(result.error).toBeNull();
    expect(result.transformedData.response.json.content).toEqual([
      tool,
      { type: 'text', text: '[REDACTED]' },
    ]);
  });

  test('keeps single-choice chat redaction working', async () => {
    const context: PluginContext = {
      requestType: 'chatComplete',
      response: {
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'EXAMPLE_PRIVATE_VALUE',
              },
            },
          ],
        },
      },
    };

    const result = await handler(context, parameters, 'afterRequestHook');

    expect(result.error).toBeNull();
    expect(
      result.transformedData.response.json.choices[0].message.content
    ).toBe('[REDACTED]');
  });
});
