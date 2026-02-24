import { logger } from '../../../apm';
import { getAccessToken } from '../../../providers/google-vertex-ai/utils';
import { externalServiceFetch } from '../../../utils/fetch';
import { requestCache } from '../../cache/cacheService';

export async function getVertexModelFromId(
  model: string,
  options: {
    vertexRegion?: string;
    vertexProjectId?: string;
    vertexServiceAccountJson?: Record<string, any>;
    apiKey?: string;
  },
  isEndpoint = false,
  env: Record<string, any>
) {
  const cache = requestCache(env);
  const cacheKey = `${model}-vertex-base-model`;
  const cachedModel = await cache.get<{ model: string }>(cacheKey, {
    useLocalCache: true,
    localCacheTtl: 604800,
  });
  if (cachedModel) {
    return cachedModel.model;
  }

  const projectId =
    options.vertexProjectId || options.vertexServiceAccountJson?.project_id;
  const region = options.vertexRegion;

  // prefer service account over api-key
  const vertexAccessToken = options.vertexServiceAccountJson
    ? await getAccessToken(options.vertexServiceAccountJson ?? {})
    : options.apiKey;

  const endpoint = await externalServiceFetch(
    `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/${isEndpoint ? 'endpoints' : 'models'}/${model}`,
    {
      headers: {
        Authorization: `Bearer ${vertexAccessToken}`,
      },
    }
  );

  try {
    const data = (await endpoint.json()) as Record<string, unknown>;
    const labels = (data.labels as Record<string, string>) ?? {};
    const finetuneModelId = labels['google-vertex-llm-tuning-job-id'];
    if (!finetuneModelId) {
      return null;
    }

    const finetuneModel = await externalServiceFetch(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/tuningJobs/${finetuneModelId}`,
      {
        headers: {
          Authorization: `Bearer ${vertexAccessToken}`,
        },
      }
    );

    const finetuneModelData = (await finetuneModel.json()) as Record<
      string,
      unknown
    >;
    const finetuneModelName =
      finetuneModelData.baseModel ??
      (finetuneModelData.source_model as any)?.baseModel;

    if (!finetuneModelName) {
      return null;
    }

    await cache.set(cacheKey, { model: finetuneModelName }, { ttl: 604800 });
    return finetuneModelName;
  } catch (error) {
    logger.error('Unable to fetch base model from endpoint.', error, {
      model,
      options,
    });
    return null;
  }
}
