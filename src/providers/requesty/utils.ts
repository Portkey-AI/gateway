import { Params } from '../../types/requestBody';

interface RequestyUsageParam {
  include?: boolean;
}

interface RequestyParams extends Params {
  reasoning?: RequestyReasoningParam;
  usage?: RequestyUsageParam;
  stream_options?: {
    include_usage?: boolean;
  };
}

type RequestyReasoningParam = {
  effort?: 'low' | 'medium' | 'high' | string;
  max_tokens?: number;
  exclude?: boolean;
};

export const transformReasoningParams = (params: RequestyParams) => {
  let reasoning: RequestyReasoningParam = { ...params.reasoning };
  if (params.reasoning_effort) {
    reasoning.effort = params.reasoning_effort;
  }
  return Object.keys(reasoning).length > 0 ? reasoning : null;
};

export const transformUsageOptions = (params: RequestyParams) => {
  let usage: RequestyUsageParam = { ...params.usage };
  if (params.stream_options?.include_usage) {
    usage.include = params.stream_options?.include_usage;
  }
  return Object.keys(usage).length > 0 ? usage : null;
};
