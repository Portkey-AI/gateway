import { handler } from './medical-advice-detection';
import { HookEventType, PluginContext, PluginParameters } from '../types';

describe('Medical Advice Detection Plugin', () => {
  it('flags response with medical advice', async () => {
    const context: PluginContext = {
      response: 'The treatment for this condition is to prescribe medication.',
      request: {},
    };
    const parameters: PluginParameters = {
      warningThreshold: 0.7,
    };
    const options = { env: {} };

    const result = await handler(
      context,
      parameters,
      'afterRequestHook',
      options
    );

    expect(result.verdict).toBe(false);
    expect(result.data).toHaveProperty('warning');
  });

  it('allows response without medical advice', async () => {
    const context: PluginContext = {
      response: 'You should drink more water to stay hydrated.',
      request: {},
    };
    const parameters: PluginParameters = {
      warningThreshold: 0.7,
    };
    const options = { env: {} };

    const result = await handler(
      context,
      parameters,
      'afterRequestHook',
      options
    );

    expect(result.verdict).toBe(true);
    expect(result.data).not.toHaveProperty('warning');
  });
});
