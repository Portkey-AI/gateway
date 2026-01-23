import { LeastLatencyConfig, Params, Targets } from '../types/requestBody';

/**
 * Represents a latency measurement record for a target.
 */
interface LatencyRecord {
  /** Rolling window of latency measurements in milliseconds */
  samples: number[];
  /** Cached average latency for quick access */
  avgLatency: number;
  /** Timestamp of the last update */
  lastUpdated: number;
}

/**
 * Module-level storage for latency data.
 * Uses in-memory Map for simplicity - resets on restart which is acceptable for latency data.
 */
const latencyStore = new Map<string, LatencyRecord>();

/**
 * Default configuration values for the least_latency strategy.
 */
const DEFAULT_CONFIG: Required<LeastLatencyConfig> = {
  windowSize: 100,
  minSamples: 3,
  explorationRate: 0.1,
};

/**
 * LatencyTracker manages latency measurements and provider selection
 * for the least_latency routing strategy.
 *
 * It uses an epsilon-greedy approach:
 * - Explores new/under-sampled targets first
 * - 90% of the time selects the fastest target
 * - 10% of the time randomly explores to handle provider recovery
 */
export class LatencyTracker {
  private config: Required<LeastLatencyConfig>;

  constructor(config?: LeastLatencyConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generates a unique key for a target based on its JSON path, provider, and model.
   * @param jsonPath - The JSON path identifying the target in the config
   * @param provider - The provider name (optional)
   * @param model - The model name (optional)
   * @returns A unique string key for the target
   */
  static getTargetKey(
    jsonPath: string,
    provider?: string,
    model?: string
  ): string {
    return `${jsonPath}:${provider || 'unknown'}:${model || 'default'}`;
  }

  /**
   * Records a latency measurement for a target.
   * Maintains a rolling window of samples and updates the average.
   * @param targetKey - The unique key for the target
   * @param latencyMs - The latency measurement in milliseconds
   */
  recordLatency(targetKey: string, latencyMs: number): void {
    const record = latencyStore.get(targetKey) || {
      samples: [],
      avgLatency: Infinity,
      lastUpdated: 0,
    };

    record.samples.push(latencyMs);

    // Maintain rolling window
    if (record.samples.length > this.config.windowSize) {
      record.samples.shift();
    }

    // Recalculate average
    record.avgLatency =
      record.samples.reduce((a, b) => a + b, 0) / record.samples.length;
    record.lastUpdated = Date.now();

    latencyStore.set(targetKey, record);
  }

  /**
   * Gets the latency record for a target.
   * @param targetKey - The unique key for the target
   * @returns The latency record or undefined if not found
   */
  getLatency(targetKey: string): LatencyRecord | undefined {
    return latencyStore.get(targetKey);
  }

  /**
   * Selects the best target based on latency using epsilon-greedy approach.
   *
   * Selection logic:
   * 1. If any target has fewer samples than minSamples, select the one with fewest samples
   * 2. Otherwise, with probability explorationRate, select randomly
   * 3. Otherwise, select the target with lowest average latency
   *
   * @param targets - Array of available targets
   * @param basePath - The base JSON path for constructing target keys
   * @param params - Request params containing the model
   * @returns The selected target and its index
   */
  selectTarget(
    targets: Targets[],
    basePath: string,
    params: Params
  ): { target: Targets; index: number } {
    // Build target data with latency information
    const targetData = targets.map((target, index) => {
      const originalIndex = target.originalIndex ?? index;
      const key = LatencyTracker.getTargetKey(
        `${basePath}.targets[${originalIndex}]`,
        target.provider,
        params.model
      );
      const record = latencyStore.get(key);
      return {
        target,
        index,
        originalIndex,
        key,
        samples: record?.samples.length || 0,
        avgLatency: record?.avgLatency ?? Infinity,
      };
    });

    // Phase 1: Exploration - try targets with insufficient samples
    const needsExploration = targetData.filter(
      (t) => t.samples < this.config.minSamples
    );
    if (needsExploration.length > 0) {
      // Sort by fewest samples first, then by index for deterministic ordering
      needsExploration.sort((a, b) => {
        if (a.samples !== b.samples) return a.samples - b.samples;
        return a.index - b.index;
      });
      const selected = needsExploration[0];
      return { target: selected.target, index: selected.index };
    }

    // Phase 2: Random exploration (epsilon chance)
    if (Math.random() < this.config.explorationRate) {
      const randomIndex = Math.floor(Math.random() * targetData.length);
      const selected = targetData[randomIndex];
      return { target: selected.target, index: selected.index };
    }

    // Phase 3: Exploitation - select target with lowest average latency
    targetData.sort((a, b) => {
      if (a.avgLatency !== b.avgLatency) return a.avgLatency - b.avgLatency;
      // Tie-breaker: prefer lower index for deterministic behavior
      return a.index - b.index;
    });
    const selected = targetData[0];
    return { target: selected.target, index: selected.index };
  }
}

/**
 * Records latency for a target from outside the LatencyTracker class.
 * Creates a new LatencyTracker instance with the given config.
 * @param targetKey - The unique key for the target
 * @param latencyMs - The latency measurement in milliseconds
 * @param config - Optional configuration for the tracker
 */
export function recordTargetLatency(
  targetKey: string,
  latencyMs: number,
  config?: LeastLatencyConfig
): void {
  const tracker = new LatencyTracker(config);
  tracker.recordLatency(targetKey, latencyMs);
}

/**
 * Gets the latency store for testing purposes.
 * @returns The internal latency store Map
 */
export function getLatencyStore(): Map<string, LatencyRecord> {
  return latencyStore;
}

/**
 * Clears all latency data. Primarily used for testing.
 */
export function clearLatencyStore(): void {
  latencyStore.clear();
}
