/**
 * Multi-span PII masking from Lakera `payload` (message_id, start, end, detector_type).
 * Half-open [start, end) unless endInclusive.
 */

export interface PayloadItem {
  message_id?: number;
  start?: number;
  end?: number;
  detector_type?: string;
  [key: string]: unknown;
}

export function dedupePayloadItems(items: PayloadItem[]): PayloadItem[] {
  const seen = new Set<string>();
  const out: PayloadItem[] = [];
  for (const it of items) {
    const key = `${it.message_id}\0${it.start}\0${it.end}\0${it.detector_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export function mergeOverlappingIntervals(
  spans: [number, number][]
): [number, number][] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  let [curS, curE] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curE) {
      curE = Math.max(curE, e);
    } else {
      merged.push([curS, curE]);
      curS = s;
      curE = e;
    }
  }
  merged.push([curS, curE]);
  return merged;
}

export function normalizeSpan(
  start: number,
  end: number,
  length: number,
  endInclusive: boolean
): [number, number] | null {
  let e = endInclusive ? end + 1 : end;
  if (start < 0 || e < 0 || start >= length || e > length || start >= e)
    return null;
  return [start, e];
}

export function maskLabel(detectorType: string): string {
  const raw = (detectorType || '').trim();
  const base = raw.includes('/') ? raw.split('/').pop() || 'PII' : raw || 'PII';
  const safe =
    base
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase() || 'PII';
  return `[MASKED_${safe}]`;
}

export type SpanLabel = [number, number, string];

export function mergeSpansWithLabels(raw: SpanLabel[]): SpanLabel[] {
  if (raw.length === 0) return [];
  const sorted = [...raw].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: SpanLabel[] = [];
  let [curS, curE, curL] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e, lab] = sorted[i];
    if (s <= curE) {
      curE = Math.max(curE, e);
    } else {
      merged.push([curS, curE, curL]);
      curS = s;
      curE = e;
      curL = lab;
    }
  }
  merged.push([curS, curE, curL]);
  return merged;
}

function collectNormalizedSpans(
  items: PayloadItem[],
  messageId: number,
  textLen: number,
  endInclusive: boolean
): { spans: SpanLabel[]; warnings: string[] } {
  const warnings: string[] = [];
  const spans: SpanLabel[] = [];
  const forMsg = dedupePayloadItems(
    items.filter((p) => p.message_id === messageId)
  );
  for (const p of forMsg) {
    if (p.start === undefined || p.end === undefined) {
      warnings.push(`skip span missing start/end: ${JSON.stringify(p)}`);
      continue;
    }
    const start = Number(p.start);
    const end = Number(p.end);
    const norm = normalizeSpan(start, end, textLen, endInclusive);
    if (!norm) {
      warnings.push(
        `skip out-of-range span start=${start} end=${end} len=${textLen}`
      );
      continue;
    }
    const [a, b] = norm;
    spans.push([a, b, String(p.detector_type || '')]);
  }
  return { spans, warnings };
}

export function applyPayloadMasksToString(
  text: string,
  payloadItems: PayloadItem[],
  messageId: number,
  endInclusive: boolean
): { text: string; warnings: string[] } {
  const { spans, warnings } = collectNormalizedSpans(
    payloadItems,
    messageId,
    text.length,
    endInclusive
  );
  const merged = mergeSpansWithLabels(spans);
  let out = text;
  for (const [start, end, dt] of merged.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + maskLabel(dt) + out.slice(end);
  }
  return { text: out, warnings };
}

export function isOnlyPiiViolation(
  breakdown:
    | Array<{ detected?: boolean; detector_type?: string }>
    | null
    | undefined
): boolean {
  if (!breakdown || breakdown.length === 0) return false;
  let any = false;
  for (const item of breakdown) {
    if (!item.detected) continue;
    any = true;
    const dt = (item.detector_type || '').trim();
    if (!dt.startsWith('pii/')) return false;
  }
  return any;
}

export function applyMasksToMessages(
  messages: Array<Record<string, unknown>>,
  payload: PayloadItem[] | null | undefined,
  endInclusive: boolean
): { messages: Array<Record<string, unknown>>; warnings: string[] } {
  const warnings: string[] = [];
  if (!payload || payload.length === 0) {
    return { messages: messages.map((m) => ({ ...m })), warnings };
  }
  const out = messages.map((m) => ({ ...m, content: m.content }));
  const indices = new Set(
    payload
      .map((p) => p.message_id)
      .filter((id) => id !== undefined && id !== null)
  );
  for (const idx of indices) {
    const i = Number(idx);
    if (i < 0 || i >= out.length) {
      warnings.push(
        `payload references message_id=${i} but only ${out.length} messages`
      );
      continue;
    }
    const msg = out[i];
    const content = msg.content;
    if (Array.isArray(content)) {
      warnings.push(
        `message ${i}: multimodal content array — redaction skipped for PoC`
      );
      continue;
    }
    if (typeof content !== 'string') {
      warnings.push(`message ${i}: non-string content — skipped`);
      continue;
    }
    const r = applyPayloadMasksToString(content, payload, i, endInclusive);
    warnings.push(...r.warnings);
    msg.content = r.text;
  }
  return { messages: out, warnings };
}
