export interface Hooks {
  onStart: HookObject[];
  beforeRequest: HookObject[];
  afterRequest: HookObject[];
  onFinish: HookObject[];
}

export interface Check {
  id: string;
  parameters: object;
}

export interface HookOnFailObject {
  feedback?: HookFeedback;
  webhook?: string;
  deny?: boolean;
  custom_status_code?: number;
}

export interface HookOnSuccessObject {
  feedback?: HookFeedback;
  webhook?: string;
}

// Interface for Hook that will be contain a name for the hook and parameters for it which would be an object
// this can be extended for specific hook types later on
export interface HookObject {
  type: 'guardrail' | 'custom';
  name: string;
  checks?: Check[];
  async?: boolean;
  onFail?: HookOnFailObject;
  onSuccess?: HookOnSuccessObject;
  deny?: boolean;
}

export interface HookContextRequest {
  text: string;
  json: any;
}

export interface HookContextResponse {
  text: string;
  json: any;
}

// Interface for the context object that will be passed to the hooks
export interface HookContext {
  request: HookContextRequest;
  response: HookContextResponse;
  provider: string;
  hookType?: string;
}

export interface GuardrailFeedbackMetadata {
  successfulChecks: string;
  failedChecks: string;
  erroredChecks: string;
}

export interface GuardrailFeedback {
  value?: number;
  weight?: number;
  metadata?: GuardrailFeedbackMetadata;
}

export type HookFeedback = GuardrailFeedback;

export interface GuardrailCheckResult {
  verdict: boolean;
  error?: Error | null;
  data?: any;
  id: string;
}

export interface GuardrailResult {
  verdict: boolean;
  id?: string;
  name?: string;
  checks: GuardrailCheckResult[];
  feedback: GuardrailFeedback;
  error?: Error | null;
}

// HookResult can be of type GuardrailResult or any other type of result
export type HookResult = GuardrailResult | any;
