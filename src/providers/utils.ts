import { ANTHROPIC_STOP_REASON } from './anthropic/types';
import { FINISH_REASON, ErrorResponse, PROVIDER_FINISH_REASON } from './types';
import {
  AnthropicFinishReasonMap,
  finishReasonMap,
} from './utils/finishReasonMap';

export const generateInvalidProviderResponseError: (
  response: Record<string, any>,
  provider: string
) => ErrorResponse = (response, provider) => {
  return {
    error: {
      message: `Invalid response received from ${provider}: ${JSON.stringify(
        response
      )}`,
      type: null,
      param: null,
      code: null,
    },
    provider: provider,
  } as ErrorResponse;
};

export const generateErrorResponse: (
  errorDetails: {
    message: string;
    type: string | null;
    param: string | null;
    code: string | null;
  },
  provider: string
) => ErrorResponse = ({ message, type, param, code }, provider) => {
  return {
    error: {
      message: `${provider} error: ${message}`,
      type: type ?? null,
      param: param ?? null,
      code: code ?? null,
    },
    provider: provider,
  } as ErrorResponse;
};

type SplitResult = {
  before: string;
  after: string;
};

export function splitString(input: string, separator: string): SplitResult {
  const sepIndex = input.indexOf(separator);

  if (sepIndex === -1) {
    return {
      before: input,
      after: '',
    };
  }

  return {
    before: input.substring(0, sepIndex),
    after: input.substring(sepIndex + 1),
  };
}

/*
  Transforms the finish reason from the provider to the finish reason used by the OpenAI API.
  If the finish reason is not found in the map, it will return the stop reason.
  If the strictOpenAiCompliance is true, it will return the finish reason from the map.
  If the strictOpenAiCompliance is false, it will return the finish reason from the provider.
  NOTE: this function always returns a finish reason
*/
export const transformFinishReason = (
  finishReason?: PROVIDER_FINISH_REASON,
  strictOpenAiCompliance?: boolean
): FINISH_REASON | PROVIDER_FINISH_REASON => {
  if (!finishReason) return FINISH_REASON.stop;
  if (!strictOpenAiCompliance) return finishReason;
  const transformedFinishReason = finishReasonMap.get(finishReason);
  if (!transformedFinishReason) {
    return FINISH_REASON.stop;
  }
  return transformedFinishReason;
};

/*
  Transforms the finish reason from the provider to the finish reason used by the Anthropic API.
  If the finish reason is not found in the map, it will return the stop reason.
  NOTE: this function always returns a finish reason
*/
export const transformToAnthropicStopReason = (
  finishReason?: PROVIDER_FINISH_REASON
): ANTHROPIC_STOP_REASON => {
  if (!finishReason) return ANTHROPIC_STOP_REASON.end_turn;
  const transformedFinishReason = AnthropicFinishReasonMap.get(finishReason);
  if (!transformedFinishReason) {
    return ANTHROPIC_STOP_REASON.end_turn;
  }
  return transformedFinishReason;
};
