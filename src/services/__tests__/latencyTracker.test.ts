import {
  LatencyTracker,
  clearLatencyStore,
  getLatencyStore,
  recordTargetLatency,
} from '../latencyTracker';
import { Targets } from '../../types/requestBody';

describe('LatencyTracker', () => {
  beforeEach(() => {
    clearLatencyStore();
  });

  describe('getTargetKey', () => {
    it('should generate consistent keys', () => {
      const key1 = LatencyTracker.getTargetKey('targets[0]', 'openai', 'gpt-4');
      const key2 = LatencyTracker.getTargetKey('targets[0]', 'openai', 'gpt-4');
      expect(key1).toBe(key2);
      expect(key1).toBe('targets[0]:openai:gpt-4');
    });

    it('should handle missing provider', () => {
      const key = LatencyTracker.getTargetKey('targets[0]', undefined, 'gpt-4');
      expect(key).toBe('targets[0]:unknown:gpt-4');
    });

    it('should handle missing model', () => {
      const key = LatencyTracker.getTargetKey('targets[0]', 'openai');
      expect(key).toBe('targets[0]:openai:default');
    });

    it('should handle missing provider and model', () => {
      const key = LatencyTracker.getTargetKey('targets[0]');
      expect(key).toBe('targets[0]:unknown:default');
    });
  });

  describe('recordLatency', () => {
    it('should record latency measurements', () => {
      const tracker = new LatencyTracker();
      const key = 'test-target';

      tracker.recordLatency(key, 100);
      tracker.recordLatency(key, 200);

      const record = tracker.getLatency(key);
      expect(record?.samples).toHaveLength(2);
      expect(record?.avgLatency).toBe(150);
    });

    it('should maintain rolling window', () => {
      const tracker = new LatencyTracker({ windowSize: 3 });
      const key = 'test-target';

      tracker.recordLatency(key, 100);
      tracker.recordLatency(key, 200);
      tracker.recordLatency(key, 300);
      tracker.recordLatency(key, 400); // Should push out 100

      const record = tracker.getLatency(key);
      expect(record?.samples).toHaveLength(3);
      expect(record?.samples).toEqual([200, 300, 400]);
      expect(record?.avgLatency).toBe(300);
    });

    it('should update lastUpdated timestamp', () => {
      const tracker = new LatencyTracker();
      const key = 'test-target';
      const before = Date.now();

      tracker.recordLatency(key, 100);

      const record = tracker.getLatency(key);
      expect(record?.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(record?.lastUpdated).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('selectTarget', () => {
    it('should select unexplored targets first', () => {
      const tracker = new LatencyTracker({ minSamples: 3, explorationRate: 0 });

      // Record enough samples for target 0
      for (let i = 0; i < 5; i++) {
        tracker.recordLatency('path.targets[0]:openai:gpt-4', 100);
      }

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 0 },
        { provider: 'anthropic', originalIndex: 1 },
      ];

      const result = tracker.selectTarget(targets, 'path', { model: 'gpt-4' });

      // Should select target 1 because it has no samples
      expect(result.index).toBe(1);
    });

    it('should select target with fewest samples when multiple need exploration', () => {
      const tracker = new LatencyTracker({ minSamples: 5, explorationRate: 0 });

      // Target 0: 2 samples
      tracker.recordLatency('path.targets[0]:openai:gpt-4', 100);
      tracker.recordLatency('path.targets[0]:openai:gpt-4', 100);

      // Target 1: 1 sample
      tracker.recordLatency('path.targets[1]:anthropic:gpt-4', 200);

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 0 },
        { provider: 'anthropic', originalIndex: 1 },
      ];

      const result = tracker.selectTarget(targets, 'path', { model: 'gpt-4' });

      // Should select target 1 because it has fewer samples
      expect(result.index).toBe(1);
    });

    it('should select lowest latency target when all have sufficient samples', () => {
      const tracker = new LatencyTracker({ minSamples: 1, explorationRate: 0 });

      // Target 0: avg 200ms
      tracker.recordLatency('path.targets[0]:openai:gpt-4', 200);
      // Target 1: avg 100ms (faster)
      tracker.recordLatency('path.targets[1]:anthropic:gpt-4', 100);

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 0 },
        { provider: 'anthropic', originalIndex: 1 },
      ];

      const result = tracker.selectTarget(targets, 'path', { model: 'gpt-4' });

      expect(result.index).toBe(1); // Faster target
    });

    it('should handle originalIndex correctly', () => {
      const tracker = new LatencyTracker({ minSamples: 1, explorationRate: 0 });

      // Use originalIndex 2 for the first target in array
      tracker.recordLatency('path.targets[2]:openai:gpt-4', 200);
      tracker.recordLatency('path.targets[5]:anthropic:gpt-4', 100);

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 2 },
        { provider: 'anthropic', originalIndex: 5 },
      ];

      const result = tracker.selectTarget(targets, 'path', { model: 'gpt-4' });

      expect(result.index).toBe(1); // Lower latency
      expect(result.target.originalIndex).toBe(5);
    });

    it('should return first target when all have equal latency', () => {
      const tracker = new LatencyTracker({ minSamples: 1, explorationRate: 0 });

      tracker.recordLatency('path.targets[0]:openai:gpt-4', 100);
      tracker.recordLatency('path.targets[1]:anthropic:gpt-4', 100);

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 0 },
        { provider: 'anthropic', originalIndex: 1 },
      ];

      const result = tracker.selectTarget(targets, 'path', { model: 'gpt-4' });

      // Should prefer lower index as tie-breaker
      expect(result.index).toBe(0);
    });
  });

  describe('recordTargetLatency', () => {
    it('should record latency via helper function', () => {
      recordTargetLatency('helper-target', 150);

      const store = getLatencyStore();
      const record = store.get('helper-target');

      expect(record?.samples).toEqual([150]);
      expect(record?.avgLatency).toBe(150);
    });

    it('should respect config passed to helper function', () => {
      recordTargetLatency('config-target', 100, { windowSize: 2 });
      recordTargetLatency('config-target', 200, { windowSize: 2 });
      recordTargetLatency('config-target', 300, { windowSize: 2 });

      const store = getLatencyStore();
      const record = store.get('config-target');

      // Window size of 2 should keep only last 2 samples
      expect(record?.samples).toEqual([200, 300]);
    });
  });

  describe('clearLatencyStore', () => {
    it('should clear all latency data', () => {
      const tracker = new LatencyTracker();
      tracker.recordLatency('target1', 100);
      tracker.recordLatency('target2', 200);

      clearLatencyStore();

      expect(getLatencyStore().size).toBe(0);
    });
  });

  describe('exploration rate', () => {
    it('should sometimes explore randomly when explorationRate > 0', () => {
      const tracker = new LatencyTracker({
        minSamples: 1,
        explorationRate: 1.0, // Always explore
      });

      // Target 0 is much faster
      tracker.recordLatency('path.targets[0]:openai:gpt-4', 100);
      tracker.recordLatency('path.targets[1]:anthropic:gpt-4', 1000);

      const targets: Targets[] = [
        { provider: 'openai', originalIndex: 0 },
        { provider: 'anthropic', originalIndex: 1 },
      ];

      // With 100% exploration rate, we should sometimes get target 1
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const result = tracker.selectTarget(targets, 'path', {
          model: 'gpt-4',
        });
        results.add(result.index);
      }

      // Should have selected both targets at some point
      expect(results.size).toBe(2);
    });
  });
});
