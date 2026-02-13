import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;
const DEP_ENV_NAME = process.env.DEP_ENV_NAME;

if (SENTRY_DSN) {
  console.log('found SENTRY_DSN in env, initializing sentry');
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: DEP_ENV_NAME || 'development',
    tracesSampleRate: 0,
  });
}

interface PricingEntry {
  input_price: number; // cents per token
  output_price: number; // cents per token
}

interface ProviderPricingCache {
  models: Map<string, PricingEntry>;
  fetched_at: number;
}

const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const providerCache = new Map<string, ProviderPricingCache>();
const failedProviders = new Set<string>();
const inFlightFetches = new Map<string, Promise<ProviderPricingCache | null>>();

async function fetchProviderPricing(
  provider: string
): Promise<ProviderPricingCache | null> {
  const cached = providerCache.get(provider);
  if (cached && Date.now() - cached.fetched_at < PRICING_CACHE_TTL_MS) {
    return cached;
  }

  if (failedProviders.has(provider)) {
    return null;
  }

  const inFlight = inFlightFetches.get(provider);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async (): Promise<ProviderPricingCache | null> => {
    try {
      const url = `https://configs.portkey.ai/pricing/${encodeURIComponent(provider)}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        failedProviders.add(provider);
        return null;
      }
      const data = await response.json();
      const models = new Map<string, PricingEntry>();

      for (const [modelKey, modelData] of Object.entries(
        data as Record<string, any>
      )) {
        if (modelKey === 'default') continue;
        const payg = modelData?.pricing_config?.pay_as_you_go;
        if (payg) {
          models.set(modelKey, {
            input_price: payg.request_token?.price ?? 0,
            output_price: payg.response_token?.price ?? 0,
          });
        }
      }

      const entry: ProviderPricingCache = { models, fetched_at: Date.now() };
      providerCache.set(provider, entry);
      return entry;
    } catch {
      failedProviders.add(provider);
      return null;
    } finally {
      inFlightFetches.delete(provider);
    }
  })();

  inFlightFetches.set(provider, fetchPromise);
  return fetchPromise;
}

async function fetchPricing(
  provider: string,
  model: string
): Promise<PricingEntry | null> {
  const providerPricing = await fetchProviderPricing(provider);
  if (!providerPricing) return null;
  return providerPricing.models.get(model) ?? null;
}

export interface MetricsInput {
  provider: string | null;
  model: string | null;
  endpoint: string;
  status: number;
  stream: boolean;
  duration_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  retry_attempt_count: number;
  cache_status: string | null;
}

export async function emitSentryMetrics(input: MetricsInput): Promise<void> {
  if (!SENTRY_DSN) return;

  const attributes: Record<string, string> = {
    provider: input.provider ?? 'unknown',
    model: input.model ?? 'unknown',
    endpoint: input.endpoint,
    status: String(input.status),
    stream: String(input.stream),
  };
  if (input.cache_status) {
    attributes.cache_status = input.cache_status;
  }

  Sentry.metrics.count('gateway.request', 1, { attributes });

  Sentry.metrics.distribution('gateway.latency', input.duration_ms, {
    unit: 'millisecond',
    attributes,
  });

  if (input.retry_attempt_count > 0) {
    Sentry.metrics.count('gateway.retries', input.retry_attempt_count, {
      attributes,
    });
  }

  if (input.status >= 400) {
    Sentry.metrics.count('gateway.errors', 1, {
      attributes: {
        ...attributes,
        status_class: input.status >= 500 ? '5xx' : '4xx',
      },
    });
  }

  if (input.prompt_tokens != null) {
    Sentry.metrics.distribution('gateway.prompt_tokens', input.prompt_tokens, {
      attributes,
    });
  }

  if (input.completion_tokens != null) {
    Sentry.metrics.distribution(
      'gateway.completion_tokens',
      input.completion_tokens,
      { attributes }
    );
  }
  if (input.total_tokens != null) {
    Sentry.metrics.distribution('gateway.total_tokens', input.total_tokens, {
      attributes,
    });
  }

  if (
    input.provider &&
    input.model &&
    (input.prompt_tokens || input.completion_tokens)
  ) {
    const pricing = await fetchPricing(input.provider, input.model);
    if (pricing) {
      const inputCost =
        ((input.prompt_tokens ?? 0) * pricing.input_price) / 100;
      const outputCost =
        ((input.completion_tokens ?? 0) * pricing.output_price) / 100;
      const totalCost = inputCost + outputCost;

      Sentry.metrics.distribution('gateway.cost_usd', totalCost, {
        unit: 'none',
        attributes,
      });
      Sentry.metrics.distribution('gateway.input_cost_usd', inputCost, {
        unit: 'none',
        attributes,
      });
      Sentry.metrics.distribution('gateway.output_cost_usd', outputCost, {
        unit: 'none',
        attributes,
      });
    }
  }
}
