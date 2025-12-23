import { Params } from '../../types/requestBody';

interface OpenrouterUsageParam {
  include?: boolean;
}

interface OpenRouterParams extends Params {
  reasoning?: OpenrouterReasoningParam;
  usage?: OpenrouterUsageParam;
  stream_options?: {
    include_usage?: boolean;
  };
}

type OpenrouterReasoningParam = {
  effort?: 'low' | 'medium' | 'high' | string;
  max_tokens?: number;
  exclude?: boolean;
};

export const transformReasoningParams = (params: OpenRouterParams) => {
  let reasoning: OpenrouterReasoningParam = { ...params.reasoning };
  if (params.reasoning_effort) {
    reasoning.effort = params.reasoning_effort;
  }
  return Object.keys(reasoning).length > 0 ? reasoning : null;
};

export const transformUsageOptions = (params: OpenRouterParams) => {
  let usage: OpenrouterUsageParam = { ...params.usage };
  if (params.stream_options?.include_usage) {
    usage.include = params.stream_options?.include_usage;
  }
  return Object.keys(usage).length > 0 ? usage : null;
};
