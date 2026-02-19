/**
 * @file src/mcp/services/mcpAccessService.ts
 * MCP Access Control Service - handles capability access checks
 *
 * Note: User access is enforced at the control plane level - if a user doesn't have
 * access to an MCP server, the server config won't be returned and the request will
 * fail at the hydrateContext middleware stage.
 */

import { ControlPlane } from '../middleware/controlPlane';
import { createLogger } from '../../shared/utils/logger';
import { requestCache } from '../../services/cache/cacheService';

const logger = createLogger('mcp/accessService');

// Cache key generator
const getDisabledCapabilitiesKey = (serverId: string, workspaceId: string) =>
  `mcp:disabled:${workspaceId}:${serverId}`;

// Cache TTL constants
const DISABLED_CAPABILITIES_CACHE_TTL = 300; // 5 minutes

export type CapabilityType = 'tool' | 'prompt' | 'resource';

export interface CapabilityCheck {
  name: string;
  type: CapabilityType;
}

/**
 * Check if a specific capability is disabled for a server
 * Uses Redis Set for O(1) lookup
 */
export async function isCapabilityDisabled(
  serverId: string,
  workspaceId: string,
  name: string,
  type: CapabilityType
): Promise<boolean> {
  const cacheKey = getDisabledCapabilitiesKey(serverId, workspaceId);
  const member = `${name}:${type}`;

  try {
    const cache = requestCache();
    return await cache.isSetMember(cacheKey, member);
  } catch (error) {
    logger.error(
      `Error checking capability disabled: ${workspaceId}/${serverId}/${name}:${type}`,
      error
    );
    // Fail open on errors - capability is not disabled
    return false;
  }
}

/**
 * Get all disabled capabilities for a server
 * Useful for filtering tools/list responses
 */
export async function getDisabledCapabilities(
  serverId: string,
  workspaceId: string,
  controlPlane: ControlPlane
): Promise<Set<string>> {
  const cacheKey = getDisabledCapabilitiesKey(serverId, workspaceId);
  const cache = requestCache();

  try {
    // Check if the set exists by trying to get members
    let members = await cache.getSetMembers(
      cacheKey,
      true,
      DISABLED_CAPABILITIES_CACHE_TTL
    );

    if (members.size === 0) {
      // Cache might be empty or not populated - try to populate from control plane
      const result = await controlPlane.getMCPServerDisabledCapabilities(
        serverId,
        workspaceId
      );

      if (result && result.length > 0) {
        const capabilityMembers = result.map(
          (cap: { name: string; type: string }) => `${cap.name}:${cap.type}`
        );
        await cache.addToSet(cacheKey, ...capabilityMembers);
        members = new Set(capabilityMembers);
      }
    }

    return members;
  } catch (error) {
    logger.error(
      `Error getting disabled capabilities: ${workspaceId}/${serverId}`,
      error
    );
    return new Set();
  }
}

/**
 * Populate the disabled capabilities cache for a server
 * Called during cache invalidation or first access
 */
export async function populateDisabledCapabilitiesCache(
  serverId: string,
  workspaceId: string,
  controlPlane: ControlPlane
): Promise<void> {
  const cacheKey = getDisabledCapabilitiesKey(serverId, workspaceId);
  const cache = requestCache();

  try {
    // First clear the existing set
    await cache.delete(cacheKey);

    // Fetch from control plane
    const result = await controlPlane.getMCPServerDisabledCapabilities(
      serverId,
      workspaceId
    );

    if (result && result.length > 0) {
      const capabilityMembers = result.map(
        (cap: { name: string; type: string }) => `${cap.name}:${cap.type}`
      );
      await cache.addToSet(cacheKey, ...capabilityMembers);
      logger.debug(
        `Populated ${capabilityMembers.length} disabled capabilities for server ${workspaceId}/${serverId}`
      );
    }
  } catch (error) {
    logger.error(
      `Error populating disabled capabilities cache: ${workspaceId}/${serverId}`,
      error
    );
  }
}

/**
 * Invalidate capabilities cache for a server
 */
export async function invalidateServerCache(
  serverId: string,
  workspaceId: string
): Promise<void> {
  const cache = requestCache();
  const disabledKey = getDisabledCapabilitiesKey(serverId, workspaceId);

  // Delete the Redis SET - the local cache will be invalidated by the provider
  await cache.delete(disabledKey);

  logger.debug(`Invalidated server cache: ${workspaceId}/${serverId}`);
}

/**
 * Filter capabilities based on disabled status
 * Used for tools/list, prompts/list, resources/list responses
 */
export async function filterDisabledCapabilities<T extends { name: string }>(
  serverId: string,
  capabilities: T[],
  type: CapabilityType,
  workspaceId: string,
  controlPlane: ControlPlane
): Promise<T[]> {
  const disabledSet = await getDisabledCapabilities(
    serverId,
    workspaceId,
    controlPlane
  );

  if (disabledSet.size === 0) {
    return capabilities;
  }

  return capabilities.filter((cap) => {
    const key = `${cap.name}:${type}`;
    return !disabledSet.has(key);
  });
}
