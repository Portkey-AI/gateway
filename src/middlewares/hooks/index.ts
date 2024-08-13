import {
  Check,
  EventType,
  GuardrailCheckResult,
  GuardrailFeedback,
  HookContext,
  HookObject,
  HookOnFailObject,
  HookOnSuccessObject,
  HookResult,
} from './types';
import { plugins } from '../../../plugins';
import { Context } from 'hono';
import { HOOKS_EVENT_TYPE_PRESETS } from './globals';

class HookSpan {
  private context: HookContext;
  private beforeRequestHooks: HookObject[];
  private afterRequestHooks: HookObject[];
  private hooksResult: {
    beforeRequestHooksResult: HookResult[];
    afterRequestHooksResult: HookResult[];
  };
  private parentHookSpanId: string | null;
  public readonly id: string;

  constructor(
    requestParams: Record<string, any>,
    provider: string,
    isStreamingRequest: boolean,
    beforeRequestHooks: HookObject[],
    afterRequestHooks: HookObject[],
    parentHookSpanId: string | null
  ) {
    this.context = this.createContext(
      requestParams,
      provider,
      isStreamingRequest
    );
    this.beforeRequestHooks = this.initializeHooks(
      beforeRequestHooks,
      'beforeRequestHook'
    );
    this.afterRequestHooks = this.initializeHooks(
      afterRequestHooks,
      'afterRequestHook'
    );
    this.parentHookSpanId = parentHookSpanId;
    this.hooksResult = {
      beforeRequestHooksResult: [],
      afterRequestHooksResult: [],
    };
    this.id = crypto.randomUUID();
  }

  private createContext(
    requestParams: Record<string, any>,
    provider: string,
    isStreamingRequest: boolean
  ): HookContext {
    const requestText = this.extractRequestText(requestParams);
    return {
      request: {
        json: requestParams,
        text: requestText,
        isStreamingRequest,
      },
      response: {
        json: {},
        text: '',
        statusCode: null,
      },
      provider,
    };
  }

  private extractRequestText(requestParams: any): string {
    if (requestParams?.prompt) {
      return requestParams.prompt;
    } else if (requestParams?.messages?.length) {
      const lastMessage =
        requestParams.messages[requestParams.messages.length - 1];
      return lastMessage.content.text || lastMessage.content;
    }
    return '';
  }

  private initializeHooks(
    hooks: HookObject[],
    eventType: EventType
  ): HookObject[] {
    return hooks.map((hook) => ({ ...hook, eventType }));
  }

  public setContextResponse(
    responseJSON: Record<string, any>,
    responseStatus: number
  ): void {
    const responseText = this.extractResponseText(responseJSON);
    this.context.response = {
      json: responseJSON,
      text: responseText,
      statusCode: responseStatus,
    };
  }

  private extractResponseText(responseJSON: Record<string, any>): string {
    if (responseJSON?.choices?.length) {
      const choice = responseJSON.choices[0];
      if (choice.text) {
        return choice.text;
      } else if (choice?.message?.content) {
        return choice.message.content.text || choice.message.content;
      }
    }
    return '';
  }

  public addHookResult(eventType: EventType, result: HookResult): void {
    if (eventType === 'beforeRequestHook') {
      this.hooksResult.beforeRequestHooksResult.push(result);
    } else if (eventType === 'afterRequestHook') {
      this.hooksResult.afterRequestHooksResult.push(result);
    }
  }

  public getContext(): HookContext {
    return this.context;
  }

  public getBeforeRequestHooks(): HookObject[] {
    return this.beforeRequestHooks;
  }

  public getAfterRequestHooks(): HookObject[] {
    return this.afterRequestHooks;
  }

  public getParentHookSpanId(): string | null {
    return this.parentHookSpanId;
  }

  public getHooksResult(): {
    beforeRequestHooksResult: HookResult[];
    afterRequestHooksResult: HookResult[];
  } {
    return this.hooksResult;
  }
}

export class HooksManager {
  private spans: Record<string, HookSpan> = {};
  private plugins: any;

  constructor() {
    this.plugins = plugins;
  }

  public createSpan(
    requestParams: any,
    provider: string,
    isStreamingRequest: boolean,
    beforeRequestHooks: HookObject[],
    afterRequestHooks: HookObject[],
    parentHookSpanId: string | null
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

  public setSpanContextResponse(
    spanId: string,
    responseJson: Record<string, any>,
    responseStatusCode: number
  ): void {
    const span = this.getSpan(spanId);
    span.setContextResponse(responseJson, responseStatusCode);
  }

  public async executeHooks(
    spanId: string,
    eventTypePresets: string[]
  ): Promise<{ results: HookResult[]; shouldDeny: boolean }> {
    const span = this.getSpan(spanId);

    const hooksToExecute = this.getHooksToExecute(span, eventTypePresets);

    if (hooksToExecute.length === 0) {
      return { results: [], shouldDeny: false };
    }

    try {
      const results = await Promise.all(
        hooksToExecute.map((hook) => this.executeEachHook(spanId, hook))
      );
      const shouldDeny = results.some(
        (result, index) =>
          !result.verdict && hooksToExecute[index].deny && !result.skipped
      );

      return { results, shouldDeny };
    } catch (err) {
      console.error(`Error executing hooks:`, err);
      return { results: [], shouldDeny: false };
    }
  }

  private getSpan(spanId: string): HookSpan {
    const span = this.spans[spanId] || {};
    return span;
  }

  private async executeFunction(
    context: HookContext,
    check: Check,
    eventType: EventType
  ): Promise<GuardrailCheckResult> {
    const [source, fn] = check.id.split('.');
    const createdAt = new Date();
    try {
      const result = await this.plugins[source][fn](
        context,
        check.parameters,
        eventType
      );
      return {
        ...result,
        id: check.id,
        error: result.error
          ? { name: result.error.name, message: result.error.message }
          : undefined,
        execution_time: new Date().getTime() - createdAt.getTime(),
        created_at: createdAt,
      };
    } catch (err: any) {
      console.error(`Error executing check "${check.id}":`, err);
      return {
        error: {
          name: 'Check error',
          message: 'Error executing check',
        },
        verdict: false,
        data: null,
        id: check.id,
        execution_time: new Date().getTime() - createdAt.getTime(),
        created_at: createdAt,
      };
    }
  }

  private async executeEachHook(
    spanId: string,
    hook: HookObject
  ): Promise<HookResult> {
    const span = this.getSpan(spanId);
    let hookResult: HookResult = { id: hook.id } as HookResult;
    const createdAt = new Date();

    if (this.shouldSkipHook(span, hook)) {
      return { ...hookResult, skipped: true };
    }

    if (hook.type === 'guardrail' && hook.checks) {
      const checkResults = await Promise.all(
        hook.checks.map((check) =>
          this.executeFunction(span.getContext(), check, hook.eventType)
        )
      );

      hookResult = {
        verdict: checkResults.every((result) => result.verdict || result.error),
        id: hook.id,
        checks: checkResults,
        feedback: this.createFeedbackObject(
          checkResults,
          hook.onFail,
          hook.onSuccess
        ),
        execution_time: new Date().getTime() - createdAt.getTime(),
        async: hook.async || false,
        type: hook.type,
        created_at: createdAt,
      } as HookResult;

      if (hook.deny && !hookResult.verdict) {
        hookResult.deny = true;
      } else {
        hookResult.deny = false;
      }
    }

    span.addHookResult(hook.eventType, hookResult);
    return hookResult;
  }

  private shouldSkipHook(span: HookSpan, hook: HookObject): boolean {
    const context = span.getContext();
    return (
      (hook.eventType === 'afterRequestHook' &&
        context.response.statusCode !== 200) ||
      (context.request.isStreamingRequest && !context.response.text) ||
      (hook.eventType === 'beforeRequestHook' &&
        span.getParentHookSpanId() !== null)
    );
  }

  private createFeedbackObject(
    results: GuardrailCheckResult[],
    onFail?: HookOnFailObject,
    onSuccess?: HookOnSuccessObject
  ): GuardrailFeedback {
    const verdict = results.every((result) => result.verdict || result.error);
    const feedbackConfig = verdict ? onSuccess?.feedback : onFail?.feedback;

    if (!feedbackConfig) {
      return {};
    }

    return {
      value: feedbackConfig.value,
      weight: feedbackConfig.weight,
      metadata: {
        ...feedbackConfig.metadata,
        successfulChecks: this.getCheckIds(results, true),
        failedChecks: this.getCheckIds(results, false, false),
        erroredChecks: this.getCheckIds(results, false, true),
      },
    };
  }

  private getCheckIds(
    results: GuardrailCheckResult[],
    successful: boolean,
    errored: boolean = false
  ): string {
    return results
      .filter((result) =>
        successful
          ? result.verdict === true
          : result.verdict === false && errored === !!result.error
      )
      .map((result) => result.id)
      .join(', ');
  }

  private getHooksToExecute(
    span: HookSpan,
    eventTypePresets: string[]
  ): HookObject[] {
    const hooksToExecute: HookObject[] = [];

    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.ASYNC_BEFORE_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...span.getBeforeRequestHooks().filter((h) => h.async)
      );
    }
    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.SYNC_BEFORE_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...span.getBeforeRequestHooks().filter((h) => !h.async)
      );
    }
    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.ASYNC_AFTER_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...span.getAfterRequestHooks().filter((h) => h.async)
      );
    }
    if (
      eventTypePresets.includes(
        HOOKS_EVENT_TYPE_PRESETS.SYNC_AFTER_REQUEST_HOOK
      )
    ) {
      hooksToExecute.push(
        ...span.getAfterRequestHooks().filter((h) => !h.async)
      );
    }

    return hooksToExecute;
  }
}

export const hooks = (c: Context, next: any) => {
  const hooksManager = new HooksManager();
  c.set('hooksManager', hooksManager);
  c.set('executeHooks', hooksManager.executeHooks.bind(hooksManager));
  return next();
};