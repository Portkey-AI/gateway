import { Context } from 'hono';
import { env } from 'hono/adapter';
import { StrategyModes } from '../../types/requestBody';

export interface CircuitBreakerConfig {
  failure_threshold: number;
  failure_threshold_percentage?: number;
  cooldown_interval: number; // in milliseconds
  failure_status_codes?: number[];
  minimum_requests?: number;
}

interface CircuitBreakerStatus {
  path: string;
  is_open: boolean;
  failure_count: number;
  success_count: number;
  minimum_requests?: number;
  first_failure_time?: number;
  cb_config: CircuitBreakerConfig;
}

export interface CircuitBreakerContext {
  configId: string;
  pathStatusMap: Record<string, CircuitBreakerStatus>;
}

interface CircuitBreakerDOData {
  [targetPath: string]: {
    failure_count: number;
    first_failure_time?: number;
    success_count: number;
    minimum_requests?: number;
  };
}

// Helper function to get Durable Object stub
function getCircuitBreakerDO(env: any, configId: string) {
  const id = env.CIRCUIT_BREAKER.idFromName(configId);
  return env.CIRCUIT_BREAKER.get(id);
}

/**
 * Extracts circuit breaker configurations from config and creates path mappings
 */
export const extractCircuitBreakerConfigs = (
  config: Record<string, any>,
  configId: string,
  parentPath: string = 'config',
  parentBreakerConfig?: CircuitBreakerConfig
): CircuitBreakerContext => {
  const pathStatusMap: Record<string, CircuitBreakerStatus> = {};

  function recursiveExtractBreakers(
    currentConfig: Record<string, any>,
    currentPath: string,
    inheritedCBConfig?: CircuitBreakerConfig
  ) {
    // Get breaker config for current level - inherit from parent if not specified
    let currentCBConfig: CircuitBreakerConfig | undefined;

    if (
      (currentConfig.strategy?.cb_config?.failure_threshold ||
        currentConfig.strategy?.cb_config?.failure_threshold_percentage) &&
      currentConfig.strategy?.cb_config?.cooldown_interval
    ) {
      currentCBConfig = {
        failure_threshold: currentConfig.strategy.cb_config.failure_threshold,
        failure_threshold_percentage:
          currentConfig.strategy.cb_config.failure_threshold_percentage,
        cooldown_interval: Math.max(
          currentConfig.strategy.cb_config.cooldown_interval,
          30000
        ), // minimum cooldown interval of 30 seconds
        minimum_requests: currentConfig.strategy.cb_config.minimum_requests,
        failure_status_codes:
          currentConfig.strategy.cb_config.failure_status_codes,
      };
    } else {
      currentCBConfig = inheritedCBConfig;
    }

    // If this is a target (has virtual_key) or a strategy with targets
    if (currentConfig.virtual_key) {
      if (currentCBConfig) {
        pathStatusMap[currentPath] = {
          path: currentPath,
          is_open: false,
          failure_count: 0,
          success_count: 0,
          cb_config: currentCBConfig,
        };
      }
    }

    // If this is a conditional strategy, ignore circuit breaker
    if (currentConfig.strategy?.mode === StrategyModes.CONDITIONAL) {
      currentCBConfig = undefined;
    }

    // Process targets recursively
    if (currentConfig.targets) {
      currentConfig.targets.forEach((target: any, index: number) => {
        const targetPath = `${currentPath}.targets[${index}]`;
        recursiveExtractBreakers(target, targetPath, currentCBConfig);
      });
    }
  }

  recursiveExtractBreakers(config, parentPath, parentBreakerConfig);

  return {
    configId,
    pathStatusMap,
  };
};

/**
 * Checks circuit breaker status from Durable Object storage
 */
export const checkCircuitBreakerStatus = async (
  env: any,
  circuitBreakerContext: CircuitBreakerContext
): Promise<CircuitBreakerContext | null> => {
  const { configId, pathStatusMap } = circuitBreakerContext;
  if (Object.keys(pathStatusMap).length === 0) {
    return null;
  }

  const updatedPathStatusMap: Record<string, CircuitBreakerStatus> = {};

  try {
    // Get circuit breaker data from Durable Object
    const circuitBreakerDO = getCircuitBreakerDO(env, configId);
    const response = await circuitBreakerDO.fetch(
      new Request('https://dummy/getStatus')
    );
    const circuitBreakerData: CircuitBreakerDOData = await response.json();

    const now = Date.now();

    let isUpdated = false;

    // Check each path's circuit breaker status
    for (const [path, status] of Object.entries(pathStatusMap)) {
      const pathData = circuitBreakerData[path];
      const failureCount = pathData?.failure_count || 0;
      const successCount = pathData?.success_count || 0;
      const firstFailureTime = pathData?.first_failure_time;
      const minimumRequests = pathData?.minimum_requests || 5;
      let currentFailurePercentage = 0;
      if (
        (failureCount || successCount) &&
        failureCount + successCount >= minimumRequests
      ) {
        currentFailurePercentage =
          (100 * failureCount) / (failureCount + successCount);
      }

      const {
        failure_threshold,
        cooldown_interval,
        failure_threshold_percentage,
      } = status.cb_config;

      let isOpen = false;

      // Check if circuit should be open
      if (
        (failure_threshold && failureCount >= failure_threshold) ||
        (failure_threshold_percentage &&
          currentFailurePercentage >= failure_threshold_percentage)
      ) {
        // If cooldown period hasn't passed, keep circuit open
        if (firstFailureTime && now - firstFailureTime < cooldown_interval) {
          isOpen = true;
        } else {
          // Cooldown period has passed, reset failure count
          delete circuitBreakerData[path];
          isUpdated = true;
        }
      }

      updatedPathStatusMap[path] = {
        ...status,
        failure_count: failureCount,
        first_failure_time: firstFailureTime,
        success_count: successCount,
        minimum_requests: minimumRequests,
        is_open: isOpen,
      };
    }

    // Update DO if needed (reset expired circuits)
    if (isUpdated) {
      await circuitBreakerDO.fetch(
        new Request('https://dummy/update', {
          method: 'POST',
          body: JSON.stringify(circuitBreakerData),
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  } catch (error) {
    console.error(
      `Error checking circuit breaker status for configId ${configId}:`,
      error
    );
    // Default to close circuits on error
    for (const [path, status] of Object.entries(pathStatusMap)) {
      updatedPathStatusMap[path] = {
        ...status,
        is_open: false,
      };
    }
  }

  return {
    configId,
    pathStatusMap: updatedPathStatusMap,
  };
};

/**
 * Updates config with circuit breaker status
 */
export const getCircuitBreakerMappedConfig = (
  config: Record<string, any>,
  circuitBreakerContext: CircuitBreakerContext
): Record<string, any> => {
  const mappedConfig = { ...config };
  const { pathStatusMap } = circuitBreakerContext;

  function recursiveUpdateStatus(
    currentConfig: Record<string, any>,
    currentPath: string
  ): boolean {
    let allTargetsOpen = true;
    let hasTargets = false;

    // Process targets recursively
    if (currentConfig.targets) {
      hasTargets = true;
      currentConfig.targets.forEach((target: any, index: number) => {
        const targetPath = `${currentPath}.targets[${index}]`;
        const targetOpen = recursiveUpdateStatus(target, targetPath);

        // Update target's is_open status
        if (pathStatusMap[targetPath]) {
          target.is_open = pathStatusMap[targetPath].is_open || targetOpen;
          target.cb_config = pathStatusMap[targetPath].cb_config;
        }

        if (!target.is_open) {
          allTargetsOpen = false;
        }
      });
    }

    // Update current level status
    if (pathStatusMap[currentPath]) {
      // If this level has its own circuit breaker status, use it
      currentConfig.is_open = pathStatusMap[currentPath].is_open;
      currentConfig.cb_config = pathStatusMap[currentPath].cb_config;

      // If all targets are open, mark strategy as open
      if (hasTargets && allTargetsOpen) {
        currentConfig.is_open = true;
      }

      return currentConfig.is_open;
    }

    // If no circuit breaker config at this level, return whether all targets are open
    return hasTargets ? allTargetsOpen : false;
  }

  recursiveUpdateStatus(mappedConfig, 'config');
  mappedConfig.id = circuitBreakerContext.configId;
  return mappedConfig;
};

/**
 * Records a failure for circuit breaker using Durable Object
 */
export const recordCircuitBreakerFailure = async (
  env: any,
  configId: string,
  cbConfig: CircuitBreakerConfig,
  targetPath: string,
  errorStatusCode: number
): Promise<void> => {
  const failureStatusCodes = getCircuitBreakerStatusCodes(cbConfig);
  if (!isCircuitBreakerFailure(errorStatusCode, failureStatusCodes)) {
    return;
  }
  const now = Date.now();

  try {
    const circuitBreakerDO = getCircuitBreakerDO(env, configId);
    await circuitBreakerDO.fetch(
      new Request('https://dummy/recordFailure', {
        method: 'POST',
        body: JSON.stringify({ path: targetPath, timestamp: now }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (error) {
    console.error(
      `Error recording circuit breaker failure for ${targetPath}:`,
      error
    );
  }
};

/**
 * Records a success for circuit breaker using Durable Object
 */
export const recordCircuitBreakerSuccess = async (
  env: any,
  configId: string,
  targetPath: string
): Promise<void> => {
  try {
    const circuitBreakerDO = getCircuitBreakerDO(env, configId);
    await circuitBreakerDO.fetch(
      new Request('https://dummy/recordSuccess', {
        method: 'POST',
        body: JSON.stringify({ path: targetPath }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (error) {
    console.error(
      `Error recording circuit breaker success for ${targetPath}:`,
      error
    );
  }
};

// Helper function to determine if status code should trigger circuit breaker
export function isCircuitBreakerFailure(
  statusCode: number,
  failureStatusCodes?: number[]
): boolean {
  return (
    failureStatusCodes?.includes(statusCode) ||
    (!failureStatusCodes && statusCode >= 500)
  );
}

export async function handleCircuitBreakerResponse(
  response: Response | undefined,
  configId: string,
  cbConfig: CircuitBreakerConfig,
  targetPath: string,
  c: Context
): Promise<void> {
  if (!cbConfig) return;

  if (response?.ok) {
    await recordCircuitBreakerSuccess(env(c), configId, targetPath);
  } else if (response) {
    await recordCircuitBreakerFailure(
      env(c),
      configId,
      cbConfig,
      targetPath,
      response.status
    );
  }
}

export function generateCircuitBreakerConfigId(
  configSlug: string,
  workspaceId: string,
  organisationId: string
): string {
  return `${organisationId}:${workspaceId}:${configSlug}`;
}

export async function destroyCircuitBreakerConfig(
  env: any,
  configSlug: string,
  workspaceId: string,
  organisationId: string
): Promise<boolean> {
  const configId = generateCircuitBreakerConfigId(
    configSlug,
    workspaceId,
    organisationId
  );

  try {
    const circuitBreakerDO = getCircuitBreakerDO(env, configId);
    await circuitBreakerDO.fetch(
      new Request('https://dummy/destroy', {
        method: 'POST',
      })
    );
    return true;
  } catch (error) {
    console.error(
      `Error destroying circuit breaker config for ${configId}:`,
      error
    );
    return false;
  }
}

function getCircuitBreakerStatusCodes(
  cbConfig: CircuitBreakerConfig
): number[] | undefined {
  if (!cbConfig) {
    return undefined;
  }
  return cbConfig.failure_status_codes;
}
