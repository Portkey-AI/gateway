import { Context } from 'hono';
import { externalServiceFetch } from '../../../utils/fetch';
import { Environment } from '../../../utils/env';
import { logger } from '../../../apm';

// Default configuration
const DEFAULT_PROVIDER = 'openai';
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_EMBEDDINGS_DIMENSIONS = 1536;

interface EmbeddingConfig {
  provider: string;
  model: string;
  apiKey: string;
  embeddingsUrl: string;
  dimensions: number;
}

function getEmbeddingConfig(env: Record<string, any>): EmbeddingConfig {
  const envVars = Environment(env);

  const provider =
    envVars.SEMANTIC_CACHE_EMBEDDING_PROVIDER || DEFAULT_PROVIDER;
  const model = envVars.SEMANTIC_CACHE_EMBEDDING_MODEL || DEFAULT_MODEL;
  const apiKey =
    envVars.SEMANTIC_CACHE_EMBEDDING_API_KEY || envVars.OPENAI_API_KEY;
  const embeddingsUrl =
    envVars.SEMANTIC_CACHE_EMBEDDINGS_URL || DEFAULT_EMBEDDINGS_URL;
  const dimensions =
    Number(envVars.SEMANTIC_CACHE_EMBEDDING_DIMENSIONS) ||
    DEFAULT_EMBEDDINGS_DIMENSIONS;

  return { provider, model, apiKey, embeddingsUrl, dimensions };
}

export const createEmbedding = async function (
  env: Record<string, any>,
  c: Context,
  input: string,
  user = 'Semantic Cache'
): Promise<number[] | false> {
  const embeddingConfig = getEmbeddingConfig(env);
  if (!input || !input.length || !embeddingConfig.apiKey) {
    return false;
  }

  const apiKey = embeddingConfig.apiKey?.replaceAll('Bearer ', '');
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const embeddingsUrl = embeddingConfig.embeddingsUrl;
  let inputBody: Record<string, any>;

  switch (embeddingConfig.provider.toLowerCase()) {
    case 'openai':
      inputBody = {
        input: [input],
        model: embeddingConfig.model,
        user,
        dimensions: embeddingConfig.dimensions,
      };
      break;
    case 'azure-openai':
      inputBody = {
        input: [input],
        model: embeddingConfig.model,
        user,
        dimensions: embeddingConfig.dimensions,
      };
      break;
    default:
      logger.error('Unsupported provider');
      return false;
  }

  try {
    const response = await externalServiceFetch(embeddingsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(inputBody),
    });

    if (response.status !== 200) {
      const errorText = await response.text();
      logger.error(
        `Embedding request failed during Semantic Cache: ${errorText}`
      );
      return false;
    }

    const res: any = await response.clone().json();

    if (!res.data?.[0]?.embedding) {
      logger.error(
        `Invalid embedding response format: ${JSON.stringify(res).substring(0, 200)}`
      );
      return false;
    }

    const embedding = res.data[0].embedding;

    // Track the embedding request for logging/metrics
    trackEmbeddingRequest(c, embeddingConfig, input, user, response);

    return embedding;
  } catch (err: any) {
    logger.error({
      message: `Gateway embedding request error: ${err.message}`,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
    });
    return false;
  }
};

/**
 * Track the embedding request for logging/metrics
 */
function trackEmbeddingRequest(
  c: Context,
  config: EmbeddingConfig,
  input: string,
  user: string,
  response: Response
): void {
  try {
    const requestOptions = c.get('requestOptions') || [];
    requestOptions.push({
      providerOptions: {
        provider: config.provider,
        requestURL: config.embeddingsUrl,
        rubeusURL: 'embed',
      },
      requestParams: { input, model: config.model, user },
      response,
      lastUsedOptionIndex: 0,
    });
    c.set('requestOptions', requestOptions);
  } catch (err) {
    // Silently ignore tracking errors
  }
}
