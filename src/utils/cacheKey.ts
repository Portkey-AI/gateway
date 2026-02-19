import { CacheKeyTypes } from '../middlewares/portkey/globals';

export function generateV2CacheKey({
  organisationId,
  workspaceId,
  cacheKeyType,
  key,
}: {
  organisationId?: string;
  workspaceId?: string | null;
  cacheKeyType: CacheKeyTypes;
  key: string;
}) {
  let cacheKey = `${cacheKeyType}_${key}_`;
  if (organisationId) {
    cacheKey += `${CacheKeyTypes.ORGANISATION}_${organisationId}_`;
  }
  if (workspaceId) {
    cacheKey += `${CacheKeyTypes.WORKSPACE}_${workspaceId}`;
  }
  return cacheKey;
}
