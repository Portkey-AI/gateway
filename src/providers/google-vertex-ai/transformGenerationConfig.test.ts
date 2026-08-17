import { getThinkingConfigForReasoningEffort } from './transformGenerationConfig';
import { transformGenerationConfig } from './transformGenerationConfig';

describe('getThinkingConfigForReasoningEffort', () => {
  // Gemini 2.5 only understands `thinkingBudget`; `thinkingLevel` is Gemini 3+.
  // Sending `thinkingLevel` to a 2.5 model is ignored server-side, which on
  // gemini-2.5-flash-lite (default budget 0) meant no thinking at all.
  it.each(['minimal', 'low', 'medium', 'high'])(
    'maps reasoning_effort=%s to a thinkingBudget for gemini-2.5 models',
    (effort) => {
      const config = getThinkingConfigForReasoningEffort(
        effort,
        'gemini-2.5-flash-lite'
      );

      expect(config).toBeDefined();
      expect(config).not.toHaveProperty('thinkingLevel');
      expect(typeof config?.thinkingBudget).toBe('number');
      expect(config?.thinkingBudget).toBeGreaterThan(0);
    }
  );

  it('maps higher effort to a larger budget on gemini-2.5', () => {
    const low = getThinkingConfigForReasoningEffort(
      'low',
      'gemini-2.5-flash-lite'
    )?.thinkingBudget;
    const high = getThinkingConfigForReasoningEffort(
      'high',
      'gemini-2.5-flash-lite'
    )?.thinkingBudget;

    expect(high).toBeGreaterThan(low);
  });

  it('applies to every gemini-2.5 variant, not just flash-lite', () => {
    for (const model of [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash-lite',
      'google.gemini-2.5-flash-lite',
    ]) {
      const config = getThinkingConfigForReasoningEffort('low', model);
      expect(config).toHaveProperty('thinkingBudget');
      expect(config).not.toHaveProperty('thinkingLevel');
    }
  });

  it.each([
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'google.gemini-3-pro-preview',
  ])('keeps thinkingLevel for %s', (model) => {
    expect(getThinkingConfigForReasoningEffort('low', model)).toEqual({
      thinkingLevel: 'low',
    });
  });

  it('defaults to thinkingLevel when the model is unknown', () => {
    expect(getThinkingConfigForReasoningEffort('high', undefined)).toEqual({
      thinkingLevel: 'high',
    });
  });
});

describe('transformGenerationConfig - reasoning_effort', () => {
  it('emits thinkingBudget for gemini-2.5-flash-lite', () => {
    const generationConfig = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'low',
    } as any);

    expect(generationConfig.thinkingConfig).toHaveProperty('thinkingBudget');
    expect(generationConfig.thinkingConfig).not.toHaveProperty('thinkingLevel');
  });

  it('emits thinkingLevel for gemini-3', () => {
    const generationConfig = transformGenerationConfig({
      model: 'gemini-3-flash-preview',
      reasoning_effort: 'low',
    } as any);

    expect(generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('emits no thinkingConfig when reasoning_effort is none', () => {
    const generationConfig = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'none',
    } as any);

    expect(generationConfig.thinkingConfig).toBeUndefined();
  });

  it('leaves the explicit thinking param untouched', () => {
    const generationConfig = transformGenerationConfig({
      model: 'gemini-2.5-flash-lite',
      thinking: { type: 'enabled', budget_tokens: 2048 },
    } as any);

    expect(generationConfig.thinking_config).toEqual({
      include_thoughts: true,
      thinking_budget: 2048,
    });
  });
});
