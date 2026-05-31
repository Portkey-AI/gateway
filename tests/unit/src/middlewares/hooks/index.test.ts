import { HOOKS_EVENT_TYPE_PRESETS } from '../../../../../src/middlewares/hooks/globals';
import { HooksManager } from '../../../../../src/middlewares/hooks';
import {
  HookObject,
  HookType,
} from '../../../../../src/middlewares/hooks/types';

jest.mock('../../../../../plugins', () => ({
  plugins: {
    test: {
      transform: jest.fn(async () => ({
        verdict: true,
        data: null,
        transformed: true,
        transformedData: {
          request: {
            json: {
              messages: [{ role: 'user', content: 'transformed message' }],
            },
          },
          response: { json: null },
        },
      })),
    },
  },
}));

describe('HooksManager transformedData results', () => {
  const createManagerWithTransformHook = (
    includeHookTransformedData = false
  ) => {
    const hooksManager = new HooksManager();
    const hook: HookObject = {
      id: 'test-hook',
      type: HookType.MUTATOR,
      checks: [{ id: 'test.transform', parameters: {} }],
    } as HookObject;

    const span = hooksManager.createSpan(
      { messages: [{ role: 'user', content: 'original message' }] },
      {},
      'openai',
      false,
      [hook],
      [],
      null,
      'chatComplete',
      {},
      includeHookTransformedData
    );

    return { hooksManager, span };
  };

  it('omits transformedData from hook results by default', async () => {
    const { hooksManager, span } = createManagerWithTransformHook();

    await hooksManager.executeHooks(
      span.id,
      [HOOKS_EVENT_TYPE_PRESETS.SYNC_BEFORE_REQUEST_HOOK],
      { env: {} }
    );

    const checkResult =
      span.getHooksResult().beforeRequestHooksResult[0].checks[0];

    expect(checkResult.transformed).toBe(true);
    expect(checkResult.transformedData).toBeUndefined();
  });

  it('includes transformedData in hook results when enabled', async () => {
    const { hooksManager, span } = createManagerWithTransformHook(true);

    await hooksManager.executeHooks(
      span.id,
      [HOOKS_EVENT_TYPE_PRESETS.SYNC_BEFORE_REQUEST_HOOK],
      { env: {} }
    );

    const checkResult =
      span.getHooksResult().beforeRequestHooksResult[0].checks[0];

    expect(checkResult.transformedData).toEqual({
      request: {
        json: {
          messages: [{ role: 'user', content: 'transformed message' }],
        },
      },
      response: { json: null },
    });
  });
});
