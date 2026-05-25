import { OracleChatCompleteConfig } from './chatComplete';

const buildChatRequest = (model: string, params: any = {}) => {
  const cfg = (OracleChatCompleteConfig.model as any[])[0];
  return cfg.transform(
    { model, messages: [{ role: 'user', content: 'hi' }], ...params },
    { oracleCompartmentId: 'ocid1.compartment.oc1..test' }
  );
};

describe('Oracle chat — GPT-5 maxCompletionTokens routing', () => {
  it('routes maxTokens → maxCompletionTokens for openai.gpt-5', () => {
    const req = buildChatRequest('openai.gpt-5', { max_tokens: 200 });
    expect(req.maxTokens).toBeUndefined();
    expect(req.maxCompletionTokens).toBe(200);
  });

  it('routes maxTokens → maxCompletionTokens for gpt-5 variants (e.g. gpt-5-mini)', () => {
    const req = buildChatRequest('openai.gpt-5-mini', { max_tokens: 64 });
    expect(req.maxTokens).toBeUndefined();
    expect(req.maxCompletionTokens).toBe(64);
  });

  it('keeps maxTokens for non-GPT-5 models (gpt-4o)', () => {
    const req = buildChatRequest('openai.gpt-4o', { max_tokens: 128 });
    expect(req.maxTokens).toBe(128);
    expect(req.maxCompletionTokens).toBeUndefined();
  });

  it('keeps maxTokens for Llama / Cohere / Grok / Gemini', () => {
    for (const model of [
      'meta.llama-3.3-70b-instruct',
      'cohere.command-r-plus-08-2024',
      'xai.grok-3-mini',
      'google.gemini-2.5-flash',
    ]) {
      const req = buildChatRequest(model, { max_tokens: 50 });
      expect(req.maxTokens).toBe(50);
      expect(req.maxCompletionTokens).toBeUndefined();
    }
  });
});
