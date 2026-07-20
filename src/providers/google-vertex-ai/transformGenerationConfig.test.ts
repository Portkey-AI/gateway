import {
  modelUsesThinkingBudget,
  modelUsesThinkingLevel,
  openaiReasoningEffortToThinkingBudget,
  resolveReasoningEffort,
  transformGenerationConfig,
} from './transformGenerationConfig';

describe('openaiReasoningEffortToThinkingBudget', () => {
  it('maps OpenAI effort levels to integer budgets', () => {
    expect(openaiReasoningEffortToThinkingBudget('none')).toBe(0);
    expect(openaiReasoningEffortToThinkingBudget('minimal')).toBe(512);
    expect(openaiReasoningEffortToThinkingBudget('low')).toBe(1024);
    expect(openaiReasoningEffortToThinkingBudget('medium')).toBe(8192);
    expect(openaiReasoningEffortToThinkingBudget('high')).toBe(24576);
  });

  it('accepts numeric strings', () => {
    expect(openaiReasoningEffortToThinkingBudget('2048')).toBe(2048);
  });
});

describe('model family detection', () => {
  it('detects Gemini 2.5 family as thinkingBudget path', () => {
    expect(modelUsesThinkingBudget('gemini-2.5-flash-lite')).toBe(true);
    expect(modelUsesThinkingBudget('gemini-2.5-flash')).toBe(true);
    expect(modelUsesThinkingBudget('gemini-2.5-pro')).toBe(true);
    expect(modelUsesThinkingBudget('gemini-3-flash-preview')).toBe(false);
  });

  it('detects Gemini 3+ as thinkingLevel path', () => {
    expect(modelUsesThinkingLevel('gemini-3-flash-preview')).toBe(true);
    expect(modelUsesThinkingLevel('gemini-3-pro')).toBe(true);
    expect(modelUsesThinkingLevel('gemini-2.5-flash-lite')).toBe(false);
  });
});

describe('resolveReasoningEffort', () => {
  it('prefers bare reasoning_effort', () => {
    expect(
      resolveReasoningEffort({
        reasoning_effort: 'low',
        reasoning: { effort: 'high' },
      } as any)
    ).toBe('low');
  });

  it('falls back to nested reasoning.effort', () => {
    expect(
      resolveReasoningEffort({ reasoning: { effort: 'medium' } } as any)
    ).toBe('medium');
  });
});

describe('transformGenerationConfig reasoning_effort (#1639)', () => {
  it('emits thinkingBudget for gemini-2.5-flash-lite + bare reasoning_effort', () => {
    const cfg = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'low',
    } as any);
    expect(cfg.thinkingConfig).toEqual({
      thinkingBudget: 1024,
      includeThoughts: true,
    });
    expect(cfg.thinkingConfig.thinkingLevel).toBeUndefined();
  });

  it('emits thinkingBudget for high effort on 2.5 flash', () => {
    const cfg = transformGenerationConfig({
      model: 'gemini-2.5-flash',
      reasoning_effort: 'high',
    } as any);
    expect(cfg.thinkingConfig.thinkingBudget).toBe(24576);
  });

  it('emits thinkingLevel for gemini-3 models', () => {
    const cfg = transformGenerationConfig({
      model: 'gemini-3-flash-preview',
      reasoning_effort: 'low',
    } as any);
    expect(cfg.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('honors nested reasoning.effort on 2.5 flash-lite', () => {
    const cfg = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      reasoning: { effort: 'low' },
    } as any);
    expect(cfg.thinkingConfig.thinkingBudget).toBe(1024);
  });

  it('skips none effort', () => {
    const cfg = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'none',
    } as any);
    expect(cfg.thinkingConfig).toBeUndefined();
  });
});
