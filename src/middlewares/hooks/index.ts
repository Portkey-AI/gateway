import {
  Check,
  GuardrailCheckResult,
  GuardrailFeedback,
  GuardrailResult,
  HookContext,
  HookContextRequest,
  HookContextResponse,
  HookObject,
  HookOnFailObject,
  HookOnSuccessObject,
  HookResult,
} from './types';
import { plugins } from '../../../plugins';
import { Context } from 'hono';
import { HOOKS_EVENT_TYPE_PRESETS } from './globals';

class HookSpan {
  public context: HookContext;
  public beforeRequestHooks: HookObject[];
  public afterRequestHooks: HookObject[];
  public hooksResult: {
    beforeRequestHooksResult: HookResult[];
    afterRequestHooksResult: HookResult[];
  };
  public parentHookSpanId: string | null;
  public id: string;

  constructor(
    requestParams: any,
    provider: string,
    isStreamingRequest: boolean,
    beforeRequestHooks: any,
    afterRequestHooks: any,
    parentHookSpanId: any
  ) {
    let requestText: string = '';

    if (requestParams?.prompt) {
      requestText = requestParams.prompt;
    } else if (requestParams?.messages?.length) {
      let content =
        requestParams.messages[requestParams.messages.length - 1].content;
      requestText = content.text || content;
    }

    this.context = {
      request: {
        json: requestParams,
        text: requestText,
        isStreamingRequest: isStreamingRequest,
      },
      response: {
        json: {},
        text: '',
        statusCode: null,
      },
      provider,
    };
    this.beforeRequestHooks = beforeRequestHooks || [];
    this.beforeRequestHooks.forEach((h: HookObject) => {
      h.eventType = 'beforeRequestHook';
    });

    this.afterRequestHooks = afterRequestHooks || [];
    this.afterRequestHooks.forEach((h: HookObject) => {
      h.eventType = 'afterRequestHook';
    });

    this.parentHookSpanId = parentHookSpanId;
    this.hooksResult = {
      beforeRequestHooksResult: [],
      afterRequestHooksResult: [],
    };

    this.id = crypto.randomUUID();
  }

  setContextResponse(
    responseJSON: Record<string, any>,
    responseStatus: number
  ) {
    let responseText: string = '';

    if (responseJSON?.choices?.length) {
      let choice = responseJSON.choices[0];
      if (choice.text) {
        responseText = choice.text;
      } else if (choice?.message?.content) {
        responseText = choice.message.content.text || choice.message.content;
      }
    }

    this.context.response = {
      json: responseJSON,
      text: responseText,
      statusCode: responseStatus,
    };
  }

  addAfterResponseHookResult(result: HookResult) {
    this.hooksResult.afterRequestHooksResult.push(result);
  }

  addBeforeRequestHookResult(result: HookResult) {
    this.hooksResult.beforeRequestHooksResult.push(result);
  }
}

export class HooksManager {
  public spans: Record<string, HookSpan> = {};

  private plugins: any = {};

  constructor() {
    this.plugins = plugins;
    this.spans = {};
  }

  createSpan(
    requestParams: any,
    provider: string,
    isStreamingRequest: boolean,
    beforeRequestHooks: any,
    afterRequestHooks: any,
    parentHookSpanId: any
  ): HookSpan {
    const span = new HookSpan(
      requestParams,
      provider,
      isStreamingRequest,
      beforeRequestHooks,
      afterRequestHooks,
      parentHookSpanId
    );

    this.spans[span.id] = span;
    return span;
  }

  setSpanContextResponse(
    spanId: string,
    responseJson: any,
    responseStatusCode: number
  ) {
    const span = this.spans[spanId];
    span.setContextResponse(responseJson, responseStatusCode);
  }

  getSpan(spanId: string) {
    return this.spans[spanId];
  }

  private async executeFunction(
    context: HookContext,
    check: Check,
    eventType: string
  ): Promise<GuardrailCheckResult> {
    return new Promise(async (resolve, reject) => {
      const [source, fn] = check.id.split('.');
      try {
        // console.log("Executing check", check.id, "with parameters", check.parameters, "context", this.context)
        let result = await this.plugins[source][fn](
          context,
          check.parameters,
          eventType
        );
        result.handlerName = check.id;
        // Remove the stack trace
        delete result.error?.stack;
        resolve(result as GuardrailCheckResult);
      } catch (err) {
        console.error(`Error executing check "${check.id}":`, err);
        reject(err);
      }
    });
  }

  async executeEachHook(spanId: string, hook: HookObject): Promise<HookResult> {
    let promises: Promise<any>[] = [];
    let hookResult: HookResult = { id: hook.id };
    const span = this.spans[spanId];

    try {
      // Only executing guardrail hooks for now
      if (hook.type === 'guardrail' && hook.checks) {
        if (
          hook.eventType === 'afterRequestHook' &&
          span.context.response.statusCode !== 200
        ) {
          hookResult.skipped = true;
          return hookResult;
        }

        if (
          span.context.request.isStreamingRequest &&
          !span.context.response.text
        ) {
          hookResult.skipped = true;
          return hookResult;
        }

        if (hook.eventType === 'beforeRequestHook' && span.parentHookSpanId) {
          hookResult.skipped = true;
          return hookResult;
        }

        promises.push(
          ...hook.checks.map((check) =>
            this.executeFunction(span.context, check, hook.eventType)
          )
        );
        let checkResults: GuardrailCheckResult[] = await Promise.all(promises);

        hookResult = {
          verdict: checkResults.every((result) => result.verdict),
          id: hook.id,
          checks: checkResults,
          feedback: this.createFeedbackObject(
            checkResults,
            hook.onFail,
            hook.onSuccess
          ),
        } as GuardrailResult;
      }
    } catch (err) {
      console.error(`Error executing hook ${hook.id}:`, err);
      hookResult.error = err;
    }

    if (hook.eventType === 'beforeRequestHook') {
      span.addBeforeRequestHookResult(hookResult);
    } else if (hook.eventType === 'afterRequestHook') {
      span.addAfterResponseHookResult(hookResult);
    }

    return hookResult;
  }

  private createFeedbackObject(
    results: any[],
    onFail: HookOnFailObject | undefined,
    onSuccess: HookOnSuccessObject | undefined
  ): GuardrailFeedback {
    const feedbackObj: GuardrailFeedback = {};

    if (results.some((result) => result.verdict === false)) {
      feedbackObj.value = onFail?.feedback?.value || 0;
      feedbackObj.weight = onFail?.feedback?.weight || 0;
    } else {
      feedbackObj.value = onSuccess?.feedback?.value || 0;
      feedbackObj.weight = onSuccess?.feedback?.weight || 0;
    }

    feedbackObj.metadata = {
      ...results.map((result) => result.metadata),
      successfulChecks: results
        .filter((result) => result.verdict === true)
        .map((result) => result.handlerName)
        .join(', '),
      failedChecks: results
        .filter((result) => result.verdict === false && !result.error)
        .map((result) => result.handlerName)
        .join(', '),
      erroredChecks: results
        .filter((result) => result.verdict === false && !!result.error)
        .map((result) => result.handlerName)
        .join(', '),
    };

    return feedbackObj;
  }

  async executeHooks(spanId: string, eventTypePresets: string[]): Promise<any> {
    const { beforeRequestHooks, afterRequestHooks } = this.spans[spanId];

    const hooksToExecute: HookObject[] = [];

    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.ASYNC_BEFORE_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...beforeRequestHooks.filter((h: HookObject) => h.async)
      );
    }

    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.SYNC_BEFORE_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...beforeRequestHooks.filter((h: HookObject) => !h.async)
      );
    }

    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.ASYNC_AFTER_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...afterRequestHooks.filter((h: HookObject) => h.async)
      );
    }

    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.SYNC_AFTER_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...afterRequestHooks.filter((h: HookObject) => !h.async)
      );
    }

    if (hooksToExecute.length === 0) {
      return { results: [] };
    }

    try {
      const execPromises = hooksToExecute.map((hook) =>
        this.executeEachHook(spanId, hook)
      );
      const results: HookResult[] = await Promise.all(execPromises);

      const shouldDeny = results.some(
        (obj: any, index: number) =>
          !obj.verdict && hooksToExecute[index].deny && !obj.skipped
      );

      return { results: results || [], shouldDeny };
    } catch (err) {
      console.error(`Error executing hooks"${hooksToExecute}":`, err);
      return { error: err };
    }
  }
}

export const hooks = (c: Context, next: any) => {
  const hooksManager = new HooksManager();
  c.set('hooksManager', hooksManager);
  c.set('executeHooks', hooksManager.executeHooks.bind(hooksManager));
  return next();
};
