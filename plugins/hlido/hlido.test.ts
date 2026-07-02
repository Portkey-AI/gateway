import { handler as agentTrust } from './agentTrust';
import { PluginContext, PluginParameters } from '../types';

// These tests hit the public Hlido API (no auth). `aider` is a long-standing
// high-scoring reviewed agent; a random slug is used for the unreviewed path.
describe('hlido agentTrust guardrail', () => {
  const context: PluginContext = { requestType: 'chatComplete' };

  it('passes when the agent scores at or above the threshold', async () => {
    const parameters: PluginParameters = { slug: 'aider', minScore: 50 };
    const result = await agentTrust(context, parameters, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data.reviewed).toBe(true);
    expect(typeof result.data.score).toBe('number');
  });

  it('blocks when the agent scores below the threshold', async () => {
    const parameters: PluginParameters = { slug: 'aider', minScore: 101 };
    const result = await agentTrust(context, parameters, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
  });

  it('passes an unreviewed agent by default', async () => {
    const parameters: PluginParameters = {
      slug: 'this-agent-does-not-exist-xyz',
    };
    const result = await agentTrust(context, parameters, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data.reviewed).toBe(false);
  });

  it('blocks an unreviewed agent when failOnUnreviewed is true', async () => {
    const parameters: PluginParameters = {
      slug: 'this-agent-does-not-exist-xyz',
      failOnUnreviewed: true,
    };
    const result = await agentTrust(context, parameters, 'beforeRequestHook');
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(false);
    expect(result.data.reviewed).toBe(false);
  });
});
