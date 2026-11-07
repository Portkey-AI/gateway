import { ConditionalRouter } from './conditionalRouter';
import { StrategyModes, Targets } from '../types/requestBody';

type RouterContext = {
  metadata?: Record<string, string>;
  params?: Record<string, any>;
};

function resolve(
  query: Record<string, any>,
  context: RouterContext,
  defaultTarget = 'default-target'
) {
  const config: Targets = {
    strategy: {
      mode: StrategyModes.CONDITIONAL,
      conditions: [{ query, then: 'matched' }],
      default: defaultTarget,
    },
    targets: [{ name: 'matched' }, { name: defaultTarget }],
  };

  return new ConditionalRouter(config, context).resolveTarget();
}

describe('ConditionalRouter $length', () => {
  const messages = (items: string[]) => ({
    params: { messages: items },
  });

  describe('equality shorthand', () => {
    it('matches when an array length equals the number', () => {
      const result = resolve(
        { 'params.messages': { $length: 3 } },
        messages(['a', 'b', 'c'])
      );

      expect(result.name).toBe('matched');
      expect(result.index).toBe(0);
    });

    it('does not match when an array length differs', () => {
      const result = resolve(
        { 'params.messages': { $length: 3 } },
        messages(['a', 'b'])
      );

      expect(result.name).toBe('default-target');
    });

    it('matches an empty array when the length is 0', () => {
      const result = resolve(
        { 'params.tools': { $length: 0 } },
        { params: { tools: [] } }
      );

      expect(result.name).toBe('matched');
    });

    it('matches when a string length equals the number', () => {
      const result = resolve(
        { 'params.prompt': { $length: 5 } },
        { params: { prompt: 'hello' } }
      );

      expect(result.name).toBe('matched');
    });

    it('matches an empty string when the length is 0', () => {
      const result = resolve(
        { 'metadata.topic': { $length: 0 } },
        { metadata: { topic: '' } }
      );

      expect(result.name).toBe('matched');
    });

    it('does not coerce a numeric string into a length', () => {
      const result = resolve(
        { 'params.messages': { $length: '3' } },
        messages(['a', 'b', 'c'])
      );

      expect(result.name).toBe('default-target');
    });
  });

  describe('nested comparison operators', () => {
    it.each([
      ['$gt', 5, 6, 'matched'],
      ['$gt', 5, 5, 'default-target'],
      ['$gte', 3, 3, 'matched'],
      ['$gte', 3, 2, 'default-target'],
      ['$lt', 3, 2, 'matched'],
      ['$lt', 3, 3, 'default-target'],
      ['$lte', 3, 3, 'matched'],
      ['$lte', 3, 4, 'default-target'],
      ['$eq', 3, 3, 'matched'],
      ['$eq', 3, 4, 'default-target'],
      ['$ne', 3, 2, 'matched'],
      ['$ne', 3, 3, 'default-target'],
    ])(
      '%s %s against length %s routes to %s',
      (operator, compare, length, expected) => {
        const result = resolve(
          { 'params.messages': { $length: { [operator]: compare } } },
          messages(Array.from({ length }, (_, index) => `m${index}`))
        );

        expect(result.name).toBe(expected);
      }
    );

    it('applies nested operators to string length', () => {
      const result = resolve(
        { 'params.prompt': { $length: { $gt: 5 } } },
        { params: { prompt: 'hello!' } }
      );

      expect(result.name).toBe('matched');
    });

    it('reuses $in and $nin for the length', () => {
      expect(
        resolve(
          { 'params.messages': { $length: { $in: [2, 4] } } },
          messages(['a', 'b'])
        ).name
      ).toBe('matched');

      expect(
        resolve(
          { 'params.messages': { $length: { $in: [2, 4] } } },
          messages(['a'])
        ).name
      ).toBe('default-target');

      expect(
        resolve(
          { 'params.messages': { $length: { $nin: [2, 4] } } },
          messages(['a'])
        ).name
      ).toBe('matched');
    });

    it('requires every nested operator to match', () => {
      const query = { 'params.messages': { $length: { $gte: 2, $lt: 5 } } };

      expect(resolve(query, messages(['a', 'b', 'c'])).name).toBe('matched');
      expect(resolve(query, messages(['a'])).name).toBe('default-target');
      expect(resolve(query, messages(['a', 'b', 'c', 'd', 'e'])).name).toBe(
        'default-target'
      );
    });

    it('keeps numeric-string comparison behavior of $gt', () => {
      const result = resolve(
        { 'params.messages': { $length: { $gt: '5' } } },
        messages(['a', 'b', 'c', 'd', 'e', 'f'])
      );

      expect(result.name).toBe('matched');
    });
  });

  describe('values without a length', () => {
    it.each([
      ['number', 3],
      ['plain object', { length: 3 }],
      ['null', null],
      ['missing', undefined],
    ])('does not match a %s', (_label, messagesValue) => {
      const result = resolve(
        { 'params.messages': { $length: 3 } },
        { params: { messages: messagesValue } }
      );

      expect(result.name).toBe('default-target');
    });

    it('does not match when the field is absent', () => {
      const result = resolve(
        { 'params.messages': { $length: { $gt: 0 } } },
        { params: {} }
      );

      expect(result.name).toBe('default-target');
    });

    it.each([null, ['3'], true])(
      'does not match an invalid length operand %p',
      (operand) => {
        const result = resolve(
          { 'params.messages': { $length: operand } },
          messages(['a', 'b', 'c'])
        );

        expect(result.name).toBe('default-target');
      }
    );
  });

  describe('composition with logical operators', () => {
    it('matches $and only when every clause matches', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: {
                $and: [
                  { 'params.messages': { $length: { $gt: 2 } } },
                  { 'metadata.user_plan': { $eq: 'paid' } },
                ],
              },
              then: 'paid-long',
            },
          ],
          default: 'default-target',
        },
        targets: [{ name: 'paid-long' }, { name: 'default-target' }],
      };

      const matched = new ConditionalRouter(config, {
        params: { messages: ['a', 'b', 'c'] },
        metadata: { user_plan: 'paid' },
      }).resolveTarget();
      const unmatched = new ConditionalRouter(config, {
        params: { messages: ['a', 'b', 'c'] },
        metadata: { user_plan: 'free' },
      }).resolveTarget();

      expect(matched.name).toBe('paid-long');
      expect(unmatched.name).toBe('default-target');
    });

    it('matches $or when any clause matches', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: {
                $or: [
                  { 'params.messages': { $length: 0 } },
                  { 'params.prompt': { $length: { $lte: 1 } } },
                ],
              },
              then: 'short',
            },
          ],
          default: 'default-target',
        },
        targets: [{ name: 'short' }, { name: 'default-target' }],
      };

      const matched = new ConditionalRouter(config, {
        params: { messages: ['a', 'b'], prompt: '' },
      }).resolveTarget();
      const unmatched = new ConditionalRouter(config, {
        params: { messages: ['a', 'b'], prompt: 'hello' },
      }).resolveTarget();

      expect(matched.name).toBe('short');
      expect(unmatched.name).toBe('default-target');
    });

    it('uses the first matching condition', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: { $gt: 10 } } },
              then: 'very-long',
            },
            {
              query: { 'params.messages': { $length: { $gt: 1 } } },
              then: 'long-enough',
            },
          ],
          default: 'default-target',
        },
        targets: [
          { name: 'very-long' },
          { name: 'long-enough' },
          { name: 'default-target' },
        ],
      };

      const result = new ConditionalRouter(
        config,
        messages(['a', 'b', 'c'])
      ).resolveTarget();

      expect(result.name).toBe('long-enough');
      expect(result.index).toBe(1);
    });

    it('throws when nothing matches and there is no default', () => {
      const config: Targets = {
        strategy: {
          mode: StrategyModes.CONDITIONAL,
          conditions: [
            {
              query: { 'params.messages': { $length: 1 } },
              then: 'matched',
            },
          ],
        },
        targets: [{ name: 'matched' }],
      };

      const router = new ConditionalRouter(config, messages(['a', 'b']));

      expect(() => router.resolveTarget()).toThrow(
        'Query router did not resolve to any valid target'
      );
    });

    it('throws the existing error for an unknown nested operator', () => {
      const router = new ConditionalRouter(
        {
          strategy: {
            mode: StrategyModes.CONDITIONAL,
            conditions: [
              {
                query: { 'params.messages': { $length: { $nope: 1 } } },
                then: 'matched',
              },
            ],
          },
          targets: [{ name: 'matched' }],
        },
        messages(['a'])
      );

      expect(() => router.resolveTarget()).toThrow(
        'Unsupported operator used in the query router: $nope'
      );
    });
  });
});
