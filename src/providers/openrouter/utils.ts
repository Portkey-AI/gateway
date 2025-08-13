import { Params } from '../../types/requestBody';

interface OpenRouterParams extends Params {
  reasoning?: OpenrouterReasoningParam;
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
