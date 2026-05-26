import { ConditionalRouter } from '../../../../src/services/conditionalRouter';
import { StrategyModes, Targets } from '../../../../src/types/requestBody';

interface RouterContext {
  metadata?: Record<string, any>;
  params?: Record<string, any>;
  url?: {
    pathname: string;
  };
}

describe('ConditionalRouter', () => {
  describe('$length operator', () => {
    it('should match when array length equals the specified number', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: 3 } },
              then: 'target-1',
            },
          ],
        },
        targets: [{ name: 'target-1', virtualKey: 'vk1' }],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2', 'msg3'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-1');
      expect(result.index).toBe(0);
    });

    it('should not match when array length does not equal the specified number', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: 3 } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-2');
    });

    it('should return false when value is not an array', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: 3 } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: 'not-an-array',
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-2');
    });

    it('should work with nested $gt operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $gt: 5 } } },
              then: 'target-long-conversation',
            },
          ],
          default: 'target-short-conversation',
        },
        targets: [
          { name: 'target-long-conversation', virtualKey: 'vk1' },
          { name: 'target-short-conversation', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2', 'msg3', 'msg4', 'msg5', 'msg6'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-long-conversation');
    });

    it('should work with nested $lt operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $lt: 3 } } },
              then: 'target-short',
            },
          ],
          default: 'target-long',
        },
        targets: [
          { name: 'target-short', virtualKey: 'vk1' },
          { name: 'target-long', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-short');
    });

    it('should work with nested $gte operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $gte: 3 } } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const contextEqual = {
        params: {
          messages: ['msg1', 'msg2', 'msg3'],
        },
      };

      const contextGreater = {
        params: {
          messages: ['msg1', 'msg2', 'msg3', 'msg4'],
        },
      };

      const routerEqual = new ConditionalRouter(config, contextEqual);
      expect(routerEqual.resolveTarget().name).toBe('target-1');

      const routerGreater = new ConditionalRouter(config, contextGreater);
      expect(routerGreater.resolveTarget().name).toBe('target-1');
    });

    it('should work with nested $lte operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $lte: 3 } } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const contextEqual = {
        params: {
          messages: ['msg1', 'msg2', 'msg3'],
        },
      };

      const contextLess = {
        params: {
          messages: ['msg1', 'msg2'],
        },
      };

      const routerEqual = new ConditionalRouter(config, contextEqual);
      expect(routerEqual.resolveTarget().name).toBe('target-1');

      const routerLess = new ConditionalRouter(config, contextLess);
      expect(routerLess.resolveTarget().name).toBe('target-1');
    });

    it('should work with nested $eq operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $eq: 3 } } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2', 'msg3'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-1');
    });

    it('should work with nested $ne operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $ne: 3 } } },
              then: 'target-1',
            },
          ],
          default: 'target-2',
        },
        targets: [
          { name: 'target-1', virtualKey: 'vk1' },
          { name: 'target-2', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-1');
    });

    it('should work with empty arrays', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: 0 } },
              then: 'target-empty',
            },
          ],
          default: 'target-not-empty',
        },
        targets: [
          { name: 'target-empty', virtualKey: 'vk1' },
          { name: 'target-not-empty', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: [],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-empty');
    });

    it('should work with $length in complex conditional queries', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: {
                $and: [
                  { 'params.messages': { $length: { $gt: 2 } } },
                  { 'metadata.user': { $eq: 'premium' } },
                ],
              },
              then: 'target-premium-long',
            },
            {
              query: {
                'params.messages': { $length: { $gt: 2 } },
              },
              then: 'target-long',
            },
          ],
          default: 'target-default',
        },
        targets: [
          { name: 'target-premium-long', virtualKey: 'vk1' },
          { name: 'target-long', virtualKey: 'vk2' },
          { name: 'target-default', virtualKey: 'vk3' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2', 'msg3', 'msg4'],
        },
        metadata: {
          user: 'premium',
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-premium-long');
    });

    it('should fall back to default when $length condition does not match', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $gt: 10 } } },
              then: 'target-very-long',
            },
          ],
          default: 'target-default',
        },
        targets: [
          { name: 'target-very-long', virtualKey: 'vk1' },
          { name: 'target-default', virtualKey: 'vk2' },
        ],
      };

      const context = {
        params: {
          messages: ['msg1', 'msg2', 'msg3'],
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-default');
    });

    it('should work with metadata arrays', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'metadata.tags': { $length: 2 } },
              then: 'target-two-tags',
            },
          ],
          default: 'target-other',
        },
        targets: [
          { name: 'target-two-tags', virtualKey: 'vk1' },
          { name: 'target-other', virtualKey: 'vk2' },
        ],
      };

      const context: RouterContext = {
        metadata: {
          tags: ['tag1', 'tag2'],
        },
      };

      const router = new ConditionalRouter(config, context as any);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-two-tags');
    });
  });

  describe('other operators (existing functionality)', () => {
    it('should work with $eq operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'metadata.user': { $eq: 'test-user' } },
              then: 'target-1',
            },
          ],
        },
        targets: [{ name: 'target-1', virtualKey: 'vk1' }],
      };

      const context = {
        metadata: {
          user: 'test-user',
        },
      };

      const router = new ConditionalRouter(config, context);
      const result = router.resolveTarget();

      expect(result.name).toBe('target-1');
    });

    it('should throw error for unsupported operator', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'metadata.user': { $unsupported: 'value' } },
              then: 'target-1',
            },
          ],
        },
        targets: [{ name: 'target-1', virtualKey: 'vk1' }],
      };

      const context = {
        metadata: {
          user: 'test-user',
        },
      };

      const router = new ConditionalRouter(config, context);

      expect(() => router.resolveTarget()).toThrow(
        'Unsupported operator used in the query router: $unsupported'
      );
    });

    it('should throw error when no conditions matched and no default', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'metadata.user': { $eq: 'other-user' } },
              then: 'target-1',
            },
          ],
        },
        targets: [{ name: 'target-1', virtualKey: 'vk1' }],
      };

      const context = {
        metadata: {
          user: 'test-user',
        },
      };

      const router = new ConditionalRouter(config, context);

      expect(() => router.resolveTarget()).toThrow(
        'Query router did not resolve to any valid target'
      );
    });
  });
});
