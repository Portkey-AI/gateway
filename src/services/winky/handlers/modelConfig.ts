import {
  FETCH_MODEL_PRICING_CONFIG_BASEPATH,
  MODEL_CONFIG_CACHE_TTL,
  MODEL_CONFIG_CACHE_PREFIX,
  NO_PRICING_CONFIG_CACHE_TTL,
  MODEL_CONFIG_MEM_CACHE_TTL,
} from '../utils/constants';
import { PricingConfig } from '../../../providers/types';
import { logger } from '../../../apm';
import { providers } from '../configs/index';
import { getVertexModelFromId } from '../utils/vertexAi';
import { getBillionTokensValue } from '../utils/tokenizer';
import { requestCache } from '../../cache/cacheService';
import { externalServiceFetch } from '../../../utils/fetch';
import { Environment } from '../../../utils/env';

interface PriceInput {
  model: string;
  url: string;
  reqUnits: number;
  resUnits: number;
  requestBody?: Record<string, any>;
  responseBody?: Record<string, any>;
  originalResponseBody?: Record<string, any>;
  incomingPricingConfig?: PricingConfig;
  providerOptions?: Record<string, any>;
  headers?: Record<string, string>;
}

interface ModelContext {
  model: string;
  url: string;
  reqUnits?: number;
  requestBody?: Record<string, any>;
  responseBody?: Record<string, any>;
  originalResponseBody?: Record<string, any>;
  providerOptions?: Record<string, any>;
  env: Record<string, any>;
}

type ModelResolver = (context: ModelContext) => string | Promise<string>;

const modelResolvers: Record<string, ModelResolver> = {
  openai: ({ model }) => {
    let modelName = model;
    if (modelName.startsWith('ft:')) {
      modelName = `ft:${modelName.split(':')[1]}`;
    }

    return modelName;
  },
  'azure-openai': ({ model, responseBody }) => {
    let modelName = model;
    if (modelName.includes('.ft')) {
      modelName = model.split('.ft')[0];
    }

    const isModelRouter = modelName.includes('model-router');
    if (isModelRouter) {
      modelName = responseBody?.model;
    }

    return modelName;
  },
  'azure-ai': ({ model }) => {
    let modelName = model;
    if (modelName.includes('.ft')) {
      modelName = model.split('.ft')[0];
      return `${modelName}.ft`;
    }

    return modelName;
  },
  'fireworks-ai': ({ model }) => {
    model = model.replace('accounts/fireworks/models/', '');

    if (model.includes('mixtral-8x7b')) return 'mixtral-8x7b';
    if (model.includes('dbrx-instruct')) return 'dbrx-instruct';

    const billionTokens = getBillionTokensValue(model);
    const ftB = parseInt(billionTokens.replace('b', ''));

    if (ftB <= 4) return '4b';
    if (ftB <= 16) return '16b';
    if (ftB <= 100) return '100b';

    return model;
  },

  predibase: ({ model }) => {
    if (model.includes('mixtral-8x7b')) {
      return 'mixtral-8x7b-v0-1';
    }

    const billionTokens = getBillionTokensValue(model);
    const ftB = parseInt(billionTokens.replace('b', ''));

    if (ftB <= 7) return '7b';
    if (ftB <= 21) return '21b';
    if (ftB <= 70) return '70b';

    return model;
  },

  bedrock: ({ model, requestBody }) => {
    const mappedModel = model.replace(/^(us\.|eu\.|apac\.|global\.)/, '');

    if (
      mappedModel === 'stability.stable-diffusion-xl-v1' &&
      requestBody?.step > 50
    ) {
      return 'stability.stable-diffusion-xl-v1::premium';
    }
    if (
      mappedModel === 'stability.stable-diffusion-xl-v0' &&
      requestBody?.step > 50
    ) {
      return 'stability.stable-diffusion-xl-v0::premium';
    }

    return mappedModel;
  },

  google: ({ model, reqUnits }) => {
    if (reqUnits) {
      if (reqUnits > 128000) return `${model}-gt-128k`;
      if (reqUnits <= 128000) return `${model}-lte-128k`;
    }
    return model;
  },

  'vertex-ai': async ({
    model,
    providerOptions,
    originalResponseBody,
    env,
  }) => {
    // PROVISIONED_THROUGHPUT has 0 cost (paid upfront) - return a model name that won't have pricing
    // Only skip cost attribution if vertexSkipPtuCostAttribution flag is enabled
    if (
      providerOptions?.vertexSkipPtuCostAttribution &&
      originalResponseBody?.usageMetadata?.trafficType ===
        'PROVISIONED_THROUGHPUT'
    ) {
      return 'provisioned-throughput';
    }

    // for fetching based model for fine-tuned model, with endpoint.
    const isModelAsEndpoint = /^\d+/.test(model); // currently endpoint is a number passed into reqBody.model.
    if (isModelAsEndpoint) {
      const endpointModel = await getVertexModelFromId(
        model,
        providerOptions as any,
        true,
        env
      );
      if (endpointModel) {
        return endpointModel;
      }
    }
    return model;
  },

  'stability-ai': ({ model, url, requestBody, responseBody }) => {
    let resolvedModel = requestBody?.model || responseBody?.model;
    if (!resolvedModel) {
      const fallbackModel = `stability-ai/${new URL(url).pathname.split('/').pop()}`;
      try {
        const stabilityAIURL = new URL(url);
        // v2beta url structure: https://api.stability.ai/v2beta/stable-image/generate/sd3
        if (url.includes('/v2beta/')) {
          resolvedModel = stabilityAIURL.pathname.split('/').pop();
        } else {
          // v1 url structure: $BASE_URL/v1/generation/stable-diffusion-v1-6/text-to-image
          resolvedModel = stabilityAIURL.pathname.split('/')[3];
        }
        if (!resolvedModel) {
          resolvedModel = fallbackModel;
        }
      } catch (e) {
        resolvedModel = fallbackModel;
      }
    }
    return resolvedModel || model;
  },
};

// Model resolution function
export async function resolveModelName(
  provider: string,
  context: ModelContext
): Promise<string> {
  const resolver = modelResolvers[provider];
  if (!resolver) {
    return context.model;
  }
  return await resolver(context);
}

// Format Redis key
const formatCacheKey = (provider: string, model: string): string =>
  `${MODEL_CONFIG_CACHE_PREFIX}${provider.toUpperCase()}_${model.toUpperCase()}`;

// Get default config
const getDefaultConfig = (): PricingConfig => ({
  pay_as_you_go: {
    request_token: { price: 0 },
    response_token: { price: 0 },
    cache_write_input_token: { price: 0 },
    cache_read_input_token: { price: 0 },
    request_audio_token: { price: 0 },
    response_audio_token: { price: 0 },
    request_image_token: { price: 0 },
    response_image_token: { price: 0 },
    request_text_token: { price: 0 },
    response_text_token: { price: 0 },
    cached_image_input_token: { price: 0 },
    cached_text_input_token: { price: 0 },
    reasoning_token: { price: 0 },
    prediction_accepted_token: { price: 0 },
    prediction_rejected_token: { price: 0 },
    image: {
      default: {
        default: {
          price: 0,
        },
      },
      standard: {
        '1024x1024': {
          price: 0,
        },
        '1024x1792': {
          price: 0,
        },
        '1792x1024': {
          price: 0,
        },
      },
      hd: {
        '1024x1024': {
          price: 0,
        },
        '1024x1792': {
          price: 0,
        },
        '1792x1024': {
          price: 0,
        },
      },
    },
  },
  fixed_cost: {
    request: { price: 0 },
    response: { price: 0 },
  },
  calculate: {
    request: {
      operation: 'multiply',
      operands: [{ value: 'input_tokens' }, { value: 'rates.request_token' }],
    },
    response: {
      operation: 'multiply',
      operands: [{ value: 'output_tokens' }, { value: 'rates.response_token' }],
    },
  },
  currency: 'USD',
});

// Get config from Remote using fetch
const getFromRemote = async (
  provider: string,
  model: string
): Promise<PricingConfig | null> => {
  try {
    const response = await externalServiceFetch(
      `${FETCH_MODEL_PRICING_CONFIG_BASEPATH}/${provider}/${model}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const providerConfig = (await response.json()) as PricingConfig;
    return providerConfig || null;
  } catch (error) {
    logger.warn({
      message: `S3 config fetch failed: ${error}`,
      provider,
      model,
    });
    return null;
  }
};

// Get config from local file in ../configs/
const getFromLocal = async (
  provider: string,
  model: string
): Promise<PricingConfig | null> => {
  try {
    const pricingConfig = providers[provider] as {
      [key: string]: { pricing_config: PricingConfig };
    };

    let config = pricingConfig?.[model]?.pricing_config || null;

    if (!config) {
      // try if its a fine tuned model
      const ftModelName = model.split(':')[1];
      config = pricingConfig?.[`ft:${ftModelName}`]?.pricing_config || null;
    }
    //if config doesn't have custom calculate function and currency, use default
    if (config && !config.calculate) {
      config.calculate = pricingConfig?.['default']?.pricing_config?.calculate;
    }
    if (config && !config.currency) {
      config.currency = pricingConfig?.['default']?.pricing_config?.currency;
    }

    return config;
  } catch (error) {
    logger.warn({
      message: `Local config read failed: ${error}`,
      provider,
      model,
    });
    return null;
  }
};

function convertPricing(value: number): number {
  return (value * 100) / 1000000;
}

// Main pricing config getter
export const getPricingConfig = async (
  provider: string,
  input: PriceInput,
  env: Record<string, any>
): Promise<PricingConfig> => {
  if (
    input.incomingPricingConfig &&
    input.incomingPricingConfig.pay_as_you_go &&
    !input.incomingPricingConfig.pay_as_you_go.image &&
    input.incomingPricingConfig.type === 'static'
  ) {
    return {
      pay_as_you_go: {
        request_token: {
          price: convertPricing(
            input.incomingPricingConfig.pay_as_you_go.request_token?.price || 0
          ),
        },
        response_token: {
          price: convertPricing(
            input.incomingPricingConfig.pay_as_you_go.response_token?.price || 0
          ),
        },
        cache_write_input_token: {
          price: convertPricing(
            input.incomingPricingConfig.pay_as_you_go.cache_write_input_token
              ?.price || 0
          ),
        },
        cache_read_input_token: {
          price: convertPricing(
            input.incomingPricingConfig.pay_as_you_go.cache_read_input_token
              ?.price || 0
          ),
        },
      },
      currency: input.incomingPricingConfig.currency || 'USD',
    };
  }
  // Resolve the correct model name first
  const resolvedModel = await resolveModelName(provider, {
    model: input.model,
    url: input.url,
    reqUnits: input.reqUnits,
    requestBody: input.requestBody,
    responseBody: input.responseBody,
    originalResponseBody: input.originalResponseBody,
    providerOptions: input.providerOptions,
    env,
  });

  try {
    const cache = requestCache(env);
    // Try cache first, handle TTL for mem-cache as well.
    let cachedConfig: any = await cache.get<string>(
      formatCacheKey(provider, resolvedModel),
      { useLocalCache: true, localCacheTtl: MODEL_CONFIG_MEM_CACHE_TTL }
    );
    try {
      if (cachedConfig) {
        cachedConfig = JSON.parse(cachedConfig);

        // previously marked as no pricing.
        if (cachedConfig && cachedConfig?.no_pricing === true) {
          return getDefaultConfig();
        }
        return cachedConfig as PricingConfig;
      }
    } catch (error: any) {
      logger.error({
        message: `Pricing cache read failed: ${error.message}`,
        provider,
        resolvedModel,
      });
      return getDefaultConfig();
    }

    if (!isProxyFetchEnabled(env)) {
      const localConfig = await getFromLocal(provider, resolvedModel);
      return localConfig || getDefaultConfig();
    }

    // Try Remote
    const remoteConfig = await getFromRemote(provider, resolvedModel);
    if (remoteConfig) {
      await cache.set(
        formatCacheKey(provider, resolvedModel),
        JSON.stringify(remoteConfig),
        { ttl: MODEL_CONFIG_CACHE_TTL }
      );
      return remoteConfig;
    }

    // No pricing found anywhere, marking this as not_found to avoid unnecessary calls in future
    await cache.set(
      formatCacheKey(provider, resolvedModel),
      JSON.stringify({
        no_pricing: true,
      }),
      { ttl: NO_PRICING_CONFIG_CACHE_TTL }
    );

    // Try fetching local saved config
    const localConfig = await getFromLocal(provider, resolvedModel);
    // Return default if nothing else works
    return localConfig || getDefaultConfig();
  } catch (error) {
    logger.error({
      message: `Error fetching pricing config: ${error}`,
      provider,
      resolvedModel,
    });
    return getDefaultConfig();
  }
};

// Utility functions
export const invalidateCache = async (
  provider: string,
  model: string,
  env: Record<string, any>
): Promise<void> => {
  try {
    const key = formatCacheKey(provider, model);
    await requestCache(env).delete(key);
  } catch (error) {
    logger.error({
      message: `Cache invalidation failed: ${error}`,
      provider,
      model,
    });
  }
};

export const refreshConfig = async (
  provider: string,
  input: PriceInput,
  env: Record<string, any>
): Promise<PricingConfig> => {
  await invalidateCache(provider, input.model, env);
  return getPricingConfig(provider, input, env);
};

function isProxyFetchEnabled(env: Record<string, any>): boolean {
  return (
    // Saas/Hybrid deployment
    (Environment(env).MODEL_CONFIGS_PROXY_FETCH_ENABLED === 'true' &&
      Environment(env).PRIVATE_DEPLOYMENT !== 'ON') ||
    // Full-private deployment with explicit opt in
    (Environment(env).PRIVATE_DEPLOYMENT === 'ON' &&
      Environment(env).MODEL_CONFIGS_PROXY_FETCH_ENABLED === 'ON')
  );
}
