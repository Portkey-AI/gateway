import {
  openaiReasoningEffortToVertexThinkingBudget,
  transformGenerationConfig,
} from './transformGenerationConfig';
import { PortkeyGeminiParams } from './types';

describe('openaiReasoningEffortToVertexThinkingBudget', () => {
  test.each([
    ['minimal', 512],
    ['low', 4096],
    ['medium', 16384],
    ['high', 24576],
  ])('maps %s to %d', (effort, expected) => {
    expect(openaiReasoningEffortToVertexThinkingBudget(effort)).toBe(expected);
  });

  test('returns undefined for unknown effort', () => {
    expect(
      openaiReasoningEffortToVertexThinkingBudget('extreme')
    ).toBeUndefined();
  });
});

describe('transformGenerationConfig — reasoning_effort', () => {
  test('uses thinkingBudget for gemini-2.5-flash-lite', () => {
    const params = {
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'low',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toEqual({
      thinkingBudget: 4096,
    });
  });

  test('uses thinkingBudget for gemini-2.5-flash', () => {
    const params = {
      model: 'gemini-2.5-flash',
      reasoning_effort: 'medium',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toEqual({
      thinkingBudget: 16384,
    });
  });

  test('uses thinkingBudget for gemini-2.5-pro', () => {
    const params = {
      model: 'gemini-2.5-pro',
      reasoning_effort: 'high',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toEqual({
      thinkingBudget: 24576,
    });
  });

  test('uses thinkingLevel for gemini-3-flash-preview', () => {
    const params = {
      model: 'gemini-3-flash-preview',
      reasoning_effort: 'low',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toEqual({
      thinkingLevel: 'low',
    });
  });

  test('uses thinkingLevel when model is unknown', () => {
    const params = {
      reasoning_effort: 'high',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toEqual({
      thinkingLevel: 'high',
    });
  });

  test("skips thinkingConfig when reasoning_effort is 'none'", () => {
    const params = {
      model: 'gemini-2.5-flash-lite',
      reasoning_effort: 'none',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toBeUndefined();
  });

  test('skips thinkingConfig for gemini-2.5 with unknown effort value', () => {
    const params = {
      model: 'gemini-2.5-flash',
      reasoning_effort: 'extreme',
    } as unknown as PortkeyGeminiParams;
    expect(transformGenerationConfig(params).thinkingConfig).toBeUndefined();
  });
});
