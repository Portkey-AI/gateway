import { HOOKS_EVENT_TYPE_PRESETS } from '../../../../../src/middlewares/hooks/globals';
import { HooksManager } from '../../../../../src/middlewares/hooks';
import {
  HookObject,
  HookType,
} from '../../../../../src/middlewares/hooks/types';
import { plugins } from '../../../../../plugins';

jest.mock('../../../../../plugins', () => ({
  plugins: {
    test: {
      transform: jest.fn(),
    },
  },
}));

const transform = (plugins as any).test.transform as jest.Mock;

const transformedRequest = {
  messages: [{ role: 'user', content: 'transformed message' }],
};

const transformedResponse = {
  choices: [{ message: { content: 'transformed reply' } }],
};

describe('HooksManager transformedData in hook results', () => {
  beforeEach(() => {
    transform.mockReset();
    transform.mockResolvedValue({
      verdict: true,
      data: { redactions: 1 },
      transformed: true,
      transformedData: {
        request: { json: transformedRequest },
        response: { json: null },
      },
    });
  });

  const createSpan = (
    includeHookTransformedData: boolean,
    hook: Partial<HookObject> & Pick<HookObject, 'type'>,
    event: 'before' | 'after'
  ) => {
    const hooksManager = new HooksManager();
    const fullHook = {
      id: 'test-hook',
      checks: [{ id: 'test.transform', parameters: {} }],
      ...hook,
    } as HookObject;
    const span = hooksManager.createSpan(
      { messages: [{ role: 'user', content: 'original message' }] },
      {},
      'openai',
      false,
      event === 'before' ? [fullHook] : [],
      event === 'after' ? [fullHook] : [],
      null,
      'chatComplete',
      {},
      includeHookTransformedData
    );
    if (event === 'after') {
      span.setContextResponse(
        { choices: [{ message: { content: 'original reply' } }] },
        200
      );
    }
    return { hooksManager, span };
  };

  const execute = async (
    includeHookTransformedData: boolean,
    hook: Partial<HookObject> & Pick<HookObject, 'type'>,
    event: 'before' | 'after'
  ) => {
    const { hooksManager, span } = createSpan(
      includeHookTransformedData,
      hook,
      event
    );
    await hooksManager.executeHooks(
      span.id,
      [
        event === 'before'
          ? HOOKS_EVENT_TYPE_PRESETS.SYNC_BEFORE_REQUEST_HOOK
          : HOOKS_EVENT_TYPE_PRESETS.SYNC_AFTER_REQUEST_HOOK,
      ],
      { env: {} }
    );
    const results =
      event === 'before'
        ? span.getHooksResult().beforeRequestHooksResult
        : span.getHooksResult().afterRequestHooksResult;
    return { span, check: results[0].checks[0], results };
  };

  it('omits transformedData from hook results by default and still applies the transform', async () => {
    const { span, check } = await execute(
      false,
      { type: HookType.MUTATOR },
      'before'
    );

    expect(check.transformed).toBe(true);
    expect(check.transformedData).toBeUndefined();
    expect(span.getContext().request.json).toEqual(transformedRequest);
    expect(span.getContext().request.isTransformed).toBe(true);
  });

  it('keeps transformedData on before_request_hooks when the span opts in', async () => {
    const { span, check } = await execute(
      true,
      { type: HookType.MUTATOR },
      'before'
    );

    expect(check.transformedData).toEqual({
      request: { json: transformedRequest },
      response: { json: null },
    });
    expect(check.data).toEqual({ redactions: 1 });
    expect(span.getContext().request.json).toEqual(transformedRequest);
  });

  it('keeps transformedData for sequential guardrail checks when opted in', async () => {
    transform.mockResolvedValue({
      verdict: true,
      data: null,
      transformed: true,
      transformedData: {
        request: { json: null },
        response: { json: transformedResponse },
      },
    });

    const { span, check } = await execute(
      true,
      { type: HookType.GUARDRAIL, sequential: true },
      'after'
    );

    expect(check.transformedData).toEqual({
      request: { json: null },
      response: { json: transformedResponse },
    });
    expect(span.getContext().response.json).toEqual(transformedResponse);
    expect(span.getContext().response.isTransformed).toBe(true);
  });

  it('keeps transformedData for parallel guardrail checks when opted in', async () => {
    const { check } = await execute(
      true,
      { type: HookType.GUARDRAIL, sequential: false },
      'before'
    );

    expect(check.transformedData).toEqual({
      request: { json: transformedRequest },
      response: { json: null },
    });
  });

  it('omits transformedData for parallel guardrails when the span does not opt in', async () => {
    const { check } = await execute(
      false,
      { type: HookType.GUARDRAIL },
      'before'
    );

    expect(check.transformed).toBe(true);
    expect(check.transformedData).toBeUndefined();
  });

  it('omits transformedData for sequential guardrails when the span does not opt in', async () => {
    const { span, check } = await execute(
      false,
      { type: HookType.GUARDRAIL, sequential: true },
      'after'
    );

    expect(check.transformed).toBe(true);
    expect(check.transformedData).toBeUndefined();
    expect(span.getContext().response.isTransformed).toBe(false);
  });
});
