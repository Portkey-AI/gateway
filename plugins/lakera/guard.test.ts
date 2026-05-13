import {
  applyMasksToMessages,
  applyPayloadMasksToString,
  dedupePayloadItems,
  isOnlyPiiViolation,
  mergeOverlappingIntervals,
  normalizeSpan,
} from './redaction';

describe('lakera redaction helpers', () => {
  it('mergeOverlappingIntervals merges overlap and adjacent', () => {
    expect(
      mergeOverlappingIntervals([
        [0, 3],
        [2, 5],
      ])
    ).toEqual([[0, 5]]);
    expect(
      mergeOverlappingIntervals([
        [0, 2],
        [2, 4],
      ])
    ).toEqual([[0, 4]]);
    expect(
      mergeOverlappingIntervals([
        [0, 1],
        [5, 6],
      ])
    ).toEqual([
      [0, 1],
      [5, 6],
    ]);
  });

  it('dedupePayloadItems', () => {
    const items = [
      { message_id: 0, start: 1, end: 2, detector_type: 'pii/a' },
      { message_id: 0, start: 1, end: 2, detector_type: 'pii/a' },
    ];
    expect(dedupePayloadItems(items)).toHaveLength(1);
  });

  it('normalizeSpan half-open', () => {
    expect(normalizeSpan(0, 3, 10, false)).toEqual([0, 3]);
    expect(normalizeSpan(0, 11, 10, false)).toBeNull();
  });

  it('two non-overlapping spans', () => {
    const text = 'hello SECRET1 world SECRET2 end';
    const payload = [
      { message_id: 0, start: 6, end: 13, detector_type: 'pii/foo' },
      { message_id: 0, start: 20, end: 27, detector_type: 'pii/bar' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out).not.toContain('SECRET1');
    expect(out).not.toContain('SECRET2');
    expect(out).toContain('[MASKED_');
  });

  it('overlapping spans merged once', () => {
    const text = '0123456789';
    const payload = [
      { message_id: 0, start: 2, end: 5, detector_type: 'pii/a' },
      { message_id: 0, start: 4, end: 7, detector_type: 'pii/b' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out.split('[MASKED_').length - 1).toBe(1);
  });

  it('unicode emoji index', () => {
    const text = 'hi 👋 there';
    const i = text.indexOf('👋');
    const payload = [
      { message_id: 0, start: i, end: i + 1, detector_type: 'pii/x' },
    ];
    const { text: out } = applyPayloadMasksToString(text, payload, 0, false);
    expect(out).not.toContain('👋');
    expect(out).toContain('[MASKED_');
  });

  it('invalid span skipped', () => {
    const text = 'short';
    const payload = [
      { message_id: 0, start: 0, end: 99, detector_type: 'pii/x' },
    ];
    const { text: out, warnings } = applyPayloadMasksToString(
      text,
      payload,
      0,
      false
    );
    expect(out).toBe(text);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('message_id isolation', () => {
    const msgs = [
      { role: 'user', content: 'aaa' },
      { role: 'user', content: 'bbb' },
    ];
    const payload = [
      { message_id: 1, start: 0, end: 1, detector_type: 'pii/x' },
    ];
    const { messages: out } = applyMasksToMessages(msgs, payload, false);
    expect(out[0].content).toBe('aaa');
    expect(out[1].content).not.toBe('bbb');
  });

  it('isOnlyPiiViolation', () => {
    expect(isOnlyPiiViolation([])).toBe(false);
    expect(
      isOnlyPiiViolation([{ detected: true, detector_type: 'prompt_attack' }])
    ).toBe(false);
    expect(
      isOnlyPiiViolation([{ detected: true, detector_type: 'pii/email' }])
    ).toBe(true);
  });
});
