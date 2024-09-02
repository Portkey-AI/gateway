import { handler as allUppercaseHandler } from './alluppercase';
import { PluginContext } from '../types';

describe('allUppercase handler', () => {
  it('should return true verdict for a sentence with all uppercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'THIS IS A SENTENCE. THIS IS ANOTHER SENTENCE.' },
    };
    const eventType = 'afterRequestHook';

    const result = await allUppercaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(true);
  });
  it('should return false verdict for a sentence with not all uppercase characters', async () => {
    const context: PluginContext = {
      response: { text: 'This is a sentence. This is another sentence' },
    };
    const eventType = 'afterRequestHook';

    const result = await allUppercaseHandler(context, {}, eventType);

    expect(result.error).toBe(null);
    expect(result.verdict).toBe(false);
  });
});
