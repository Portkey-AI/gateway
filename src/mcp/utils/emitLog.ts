type OtlpKeyValue = {
  key: string;
  value: {
    stringValue?: string;
    boolValue?: boolean;
    intValue?: string;
    doubleValue?: number;
    arrayValue?: any;
    kvlistValue?: any;
  };
};

type OTLPRecord = {
  timeUnixNano: string;
  attributes: OtlpKeyValue[] | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  status: { code: string };
  name: string;
};

const BATCH_MAX = 100;
const FLUSH_INTERVAL = 3000; // 3 seconds

const buffer: OTLPRecord[] = [];
let timer: NodeJS.Timeout | null = null;

export function emitLog(
  body: string | Record<string, unknown>,
  attributes?: Record<string, unknown>,
  // optional trace context for correlation in backends
  trace?: { traceId?: string; spanId?: string; flags?: number }
) {
  try {
    const nowNs = Date.now() * 1_000_000;
    const record: OTLPRecord = {
      timeUnixNano: String(nowNs),
      attributes: toKv(attributes),
      traceId: trace?.traceId ?? undefined,
      spanId: trace?.spanId ?? undefined,
      status: {
        code: 'STATUS_CODE_OK',
      },
      name: 'mcp.request',
    };
    buffer.push(record);
    if (buffer.length >= BATCH_MAX) void flush();
    else schedule();
  } catch {
    /* never throw from logging */
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_INTERVAL);
}

function flush() {
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, buffer.length);
  const payload = buildPayload(batch);

  console.log(
    'TODO: flush logs. Length:',
    JSON.stringify(payload, null, 2).length
  );

  // fetch('/v1/logs', {
  //     method: 'POST',
  //     body: JSON.stringify(payload),
  // });
}

function toKv(attrs?: Record<string, unknown>): OtlpKeyValue[] | undefined {
  if (!attrs) return undefined;
  const out: OtlpKeyValue[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    out.push({ key: k, value: toAnyValue(v) });
  }
  return out.length ? out : undefined;
}

function toAnyValue(v: unknown): any {
  try {
    if (v == null) return { stringValue: '' };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'number') {
      return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
    }
    if (typeof v === 'boolean') return { boolValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toAnyValue) } };
    if (typeof v === 'object') {
      console.log('object', v);
      return {
        kvlistValue: {
          values: Object.entries(v as Record<string, unknown>).map(
            ([k, val]) => ({ key: k, value: toAnyValue(val) })
          ),
        },
      };
    }
    return { stringValue: String(v) };
  } catch {
    return { stringValue: '[unserializable]' };
  }
}

function buildPayload(logRecords: OTLPRecord[]) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: toKv({
            'service.name': 'mcp-gateway',
          }),
        },
        scopeSpans: [
          {
            scope: {
              attributes: toKv({
                name: 'mcp',
              }),
            },
            spans: logRecords,
          },
        ],
      },
    ],
  };
}
