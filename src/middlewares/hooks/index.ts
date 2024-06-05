import { Check, GuardrailCheckResult, GuardrailFeedback, GuardrailResult, HookContext, HookContextRequest, HookContextResponse, HookObject, HookOnFailObject, HookOnSuccessObject, HookResult } from "./types";
import { plugins } from "../../../plugins";
import { Context } from "hono";

export class HooksManager {
  public context: HookContext = { 
    request: {} as HookContextRequest, 
    response: {} as HookContextResponse, 
    provider: "",
  };

  private plugins: any = {};

  constructor() {
    this.plugins = plugins;
  }

  private async executeFunction(check:Check): Promise<GuardrailCheckResult> {
    return new Promise(async (resolve, reject) => {
      const [source, fn] = check.id.split(".");
      try {
        // console.log("Executing check", check.id, "with parameters", check.parameters, "context", this.context)
        let result = await this.plugins[source][fn](this.context, check.parameters);
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

  async executeEachHook(hook: HookObject): Promise<HookResult> {
    let promises: Promise<any>[] = [];
    let hookResult: HookResult = {name: hook.name};

    try {
      // Only executing guardrail hooks for now
      if (hook.type === "guardrail" && hook.checks) {
        promises.push(...hook.checks.map(check => this.executeFunction(check)));
        let checkResults:GuardrailCheckResult[] = await Promise.all(promises);

        hookResult = {
          verdict: checkResults.every(result => result.verdict),
          name: hook.name,
          checks: checkResults,
          feedback: this.createFeedbackObject(checkResults, hook.onFail, hook.onSuccess)
        } as GuardrailResult;
      }
    } catch (err) {
      console.error(`Error executing hook ${hook.name}:`, err);
      hookResult.error = err
    }

    // console.log(hookResult);
    return hookResult;
  }

  private createFeedbackObject(results: any[], onFail:HookOnFailObject|undefined, onSuccess:HookOnSuccessObject|undefined): GuardrailFeedback {
    const feedbackObj: GuardrailFeedback = {}

    if (results.some(result => result.verdict === false)) {
      feedbackObj.value = onFail?.feedback?.value || 0;
      feedbackObj.weight = onFail?.feedback?.weight || 0;
    } else {
      feedbackObj.value = onSuccess?.feedback?.value || 0;
      feedbackObj.weight = onSuccess?.feedback?.weight || 0;
    }

    feedbackObj.metadata = {
      ...results.map(result => result.metadata),
      successfulChecks: results.filter(result => result.verdict === true).map(result => result.handlerName).join(', '),
      failedChecks: results.filter(result => result.verdict === false && !result.error).map(result => result.handlerName).join(', '),
      erroredChecks: results.filter(result => result.verdict === false && !!result.error).map(result => result.handlerName).join(', '),
    };
    
    return feedbackObj;
  }

  async executeHooksSync(hooks:HookObject[]): Promise<any> {
    if(hooks?.length) {
      // console.log("Executing hooks: ", hooks?.map(hook => hook.name).join(", "), "with context", this.context);
    }
    // Filter out any async hooks as we don't support them right now.
    let hooksToExecute = hooks?.filter(hook => !hook.async) || [];

    try {
      const execPromises = hooksToExecute.map(hook => this.executeEachHook(hook));
      const results:HookResult[] = await Promise.all(execPromises);
      let response:any;

      const shouldDeny = results.some((obj: any, index: number) => !obj.verdict && hooksToExecute[index].deny);
      // const verdict = results.every((obj: any) => obj.verdict);
      if (shouldDeny) {
        response =  new Response(JSON.stringify({
          error: {
            message: "The guardrail checks defined in the config failed. You can find more information in the `hooks_result` object.",
            type: 'hooks_failed',
            param: null,
            code: null,
          },
          hooks_result: { "before_request_hooks": results }
        }),{
          status: 446,
          headers: { "content-type": "application/json" }
        })
      }

      return {results: results || [], response};
    } catch (err) {
      console.error(`Error executing hooks"${hooks}":`, err);
      return {error: err};
    }
  }

  setContext(hookType:string, provider:string, requestParams:any = {}, responseJSON:any) {
    let requestText:string = "", responseText:string = "";

    // If the request has a prompt, use that as the text
    if (requestParams?.prompt) {
      requestText = requestParams.prompt;
    } else if (requestParams?.messages?.length) {
      let content = requestParams.messages[requestParams.messages.length - 1].content;
      requestText = content.text || content;
    }

    // If the response has a prompt, use that as the text
    if (responseJSON?.choices?.length) {
      let choice = responseJSON.choices[0];
      if(choice.text) { responseText = choice.text;}
      else if (choice?.message?.content) { 
        responseText = choice.message.content.text || choice.message.content; 
      }
    }

    this.context = {
      request: {
        json: requestParams,
        text: requestText,
      },
      response: {
        json: responseJSON,
        text: responseText
      },
      provider,
      hookType
    };
  }
}

export const hooks = (c: Context, next: any) => {
  const hooksManager = new HooksManager();
  c.set('hooksManager', hooksManager);
  c.set('executeHooks', hooksManager.executeHooksSync.bind(hooksManager));
  return next();
}