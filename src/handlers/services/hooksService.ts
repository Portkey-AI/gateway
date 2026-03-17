// hooksService.ts

import { HookSpan, HooksManager } from '../../middlewares/hooks';
import { RequestContext } from './requestContext';
import { AllHookResults } from '../../middlewares/hooks/types';

export class HooksService {
  private hooksManager: HooksManager;
  private _hookSpan: HookSpan;
  constructor(private requestContext: RequestContext) {
    this.hooksManager = requestContext.hooksManager;
    this._hookSpan = this.createSpan();
  }

  createSpan(): HookSpan {
    const {
      params,
      metadata,
      provider,
      isStreaming,
      beforeRequestHooks,
      afterRequestHooks,
      endpoint,
      requestHeaders,
    } = this.requestContext;
    const hookSpan = this.hooksManager.createSpan(
      params,
      metadata,
      provider,
      isStreaming,
      beforeRequestHooks,
      afterRequestHooks,
      null,
      endpoint,
      requestHeaders
    );
    return hookSpan;
  }

  get hookSpan(): HookSpan {
    return this._hookSpan;
  }

  get results(): AllHookResults | undefined {
    return this.hookSpan.getHooksResult();
  }

  get areSyncHooksAvailable(): boolean {
    return (
      !!this.hookSpan &&
      Boolean(
        this.hooksManager.getHooksToExecute(this.hookSpan, [
          'syncBeforeRequestHook',
          'syncAfterRequestHook',
        ]).length
      )
    );
  }

  hasFailedHooks(hookType: 'beforeRequest' | 'afterRequest' | 'any'): boolean {
    const hookResults = this.results;
    const failedBRH = hookResults?.beforeRequestHooksResult.filter(
      (hook) => !hook.verdict
    );
    const failedARH = hookResults?.afterRequestHooksResult.filter(
      (hook) => !hook.verdict
    );
    if (hookType === 'any') {
      return (failedBRH?.length ?? 0) > 0 || (failedARH?.length ?? 0) > 0;
    } else if (hookType === 'beforeRequest') {
      return (failedBRH?.length ?? 0) > 0;
    } else if (hookType === 'afterRequest') {
      return (failedARH?.length ?? 0) > 0;
    }
    return false;
  }

  hasResults(hookType: 'beforeRequest' | 'afterRequest' | 'any'): boolean {
    const hookResults = this.results;
    if (hookType === 'any') {
      return (
        (hookResults?.beforeRequestHooksResult.length ?? 0) > 0 ||
        (hookResults?.afterRequestHooksResult.length ?? 0) > 0
      );
    } else if (hookType === 'beforeRequest') {
      return (hookResults?.beforeRequestHooksResult.length ?? 0) > 0;
    } else if (hookType === 'afterRequest') {
      return (hookResults?.afterRequestHooksResult.length ?? 0) > 0;
    }
    return false;
  }
}
