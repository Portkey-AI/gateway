import { separatePromptAndMeta } from './helpers';
import { createEmbedding } from './embeddings';
import { KVStore } from './kvstore';
import { SUPPORTED_VECTOR_STORES, VectorStore } from './vectorStore';
import { Context } from 'hono';
import { logger } from '../../../apm';
import { Environment } from '../../../utils/env';
import { getRuntimeKey } from 'hono/adapter';

let vectorStore: VectorStore | null = null;
let vectorStoreInitPromise: Promise<VectorStore | null> | null = null;

async function getVectorStore(): Promise<VectorStore | null> {
  if (vectorStore) return vectorStore;

  if (!vectorStoreInitPromise) {
    const vectorStoreValue = Environment({}).VECTOR_STORE;
    if (getRuntimeKey() === 'node' && vectorStoreValue) {
      vectorStoreInitPromise = VectorStore.create(
        vectorStoreValue as SUPPORTED_VECTOR_STORES
      );
    } else {
      return null;
    }
  }

  vectorStore = await vectorStoreInitPromise;
  return vectorStore;
}

export const handleForceRefresh = async (
  env: Record<string, any>,
  key: string,
  mode: string,
  organisationId: string
) => {
  await KVStore.del(env, key);

  if (mode === 'semantic') {
    const vs = await getVectorStore();
    if (vs) {
      await vs.del(key, organisationId);
    }
  }

  return true;
};

export const fetchLLMResponseFromCache = async (
  env: Record<string, any>,
  c: Context,
  cacheKey: string,
  incomingRequestBody: Record<string, any>
) => {
  let data: string = '';
  let status = 'DISABLED';

  try {
    const cHeaders = incomingRequestBody.headersObj;
    const cacheMode =
      incomingRequestBody.cacheMode ?? incomingRequestBody.headersObj.cacheMode;

    if (cHeaders.invalidateCache === 'true') {
      status = 'REFRESH';

      await handleForceRefresh(
        env,
        cacheKey,
        cacheMode,
        incomingRequestBody.organisationId
      );
    } else if (['simple', 'semantic'].includes(cacheMode)) {
      const kvStoreResponse = await KVStore.get(env, cacheKey);
      if (kvStoreResponse) {
        data = JSON.stringify(kvStoreResponse);
      }
      status = data ? 'HIT' : 'MISS';

      if (cacheMode === 'semantic' && status != 'HIT') {
        const vs = await getVectorStore();
        if (vs) {
          const { prompt, params } = separatePromptAndMeta(
            cHeaders.proxyMode,
            incomingRequestBody.url,
            incomingRequestBody.request
          );
          if (!prompt) {
            status = 'MISS';
          } else {
            const em = await createEmbedding(env, c, prompt);
            if (!em) {
              status = 'MISS';
            } else {
              const vectorStoreResponse = await vs.get(
                em,
                Object.assign({}, cHeaders.meta, params),
                incomingRequestBody.organisationId
              );

              if (
                vectorStoreResponse &&
                typeof vectorStoreResponse === 'string'
              ) {
                const vectorKvStoreFetch = await KVStore.get(
                  env,
                  vectorStoreResponse
                );
                if (!vectorKvStoreFetch) {
                  await vs.del(
                    vectorStoreResponse,
                    incomingRequestBody.organisationId
                  );
                } else {
                  data = JSON.stringify(vectorKvStoreFetch);
                  await KVStore.put(
                    env,
                    cacheKey,
                    JSON.parse(data),
                    incomingRequestBody.headersObj.maxAge
                  );
                }
              }
              status = data ? 'SEMANTIC HIT' : 'SEMANTIC MISS';
            }
          }
        }
      }
    }
  } catch (err: any) {
    logger.error({
      message: `fetchLLMResponseFromCache error: ${err.message}`,
    });
    return false;
  }

  return { data, status, cacheKey };
};

export const storeLLMResponseInCache = async (
  env: Record<string, any>,
  c: Context,
  cacheKey: string,
  incomingRequestBody: Record<string, any>
) => {
  try {
    const cacheMode =
      incomingRequestBody.cacheMode ?? incomingRequestBody.headersObj.cacheMode;

    if (['simple', 'semantic'].includes(cacheMode)) {
      await KVStore.put(
        env,
        cacheKey,
        incomingRequestBody.response,
        incomingRequestBody.headersObj.maxAge
      );
    }

    if (cacheMode === 'semantic') {
      const vs = await getVectorStore();
      if (vs) {
        const { prompt: textToEmbed, params: meta } = separatePromptAndMeta(
          incomingRequestBody.headersObj.proxyMode,
          incomingRequestBody.url,
          incomingRequestBody.request
        );
        if (textToEmbed) {
          const em = await createEmbedding(env, c, textToEmbed);

          if (em) {
            const vectorMeta = Object.assign(
              {},
              incomingRequestBody.headersObj.meta,
              meta
            );
            await vs.put(
              cacheKey,
              em,
              vectorMeta,
              incomingRequestBody.organisationId
            );
          }
        }
      }
    }
  } catch (err: any) {
    logger.error({
      message: `storeLLMResponseInCache error: ${err.message}`,
    });
    return false;
  }

  return true;
};
