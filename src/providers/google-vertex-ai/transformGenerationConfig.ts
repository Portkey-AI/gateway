import {
  recursivelyDeleteUnsupportedParameters,
  transformGeminiToolParameters,
} from './utils';
import { GoogleEmbedParams } from './embed';
import { EmbedInstancesData, PortkeyGeminiParams } from './types';

/** OpenAI reasoning_effort → Gemini 2.5 thinkingBudget (token budget). */
export const openaiReasoningEffortToThinkingBudget = (
  reasoningEffort: string
): number | undefined => {
  const map: Record<string, number> = {
    none: 0,
    minimal: 512,
    low: 1024,
    medium: 8192,
    high: 24576,
  };
  const key = reasoningEffort.toLowerCase();
  if (key in map) return map[key];
  // allow numeric string budgets
  const asNum = Number(reasoningEffort);
  if (!Number.isNaN(asNum)) return asNum;
  return undefined;
};

/** Gemini 3+ uses thinkingLevel; Gemini 2.5 family uses thinkingBudget. */
export const modelUsesThinkingLevel = (model?: string): boolean => {
  if (!model) return false;
  const m = model.toLowerCase();
  // Gemini 3.x and later thinkingLevel enum path
  return /gemini-3/.test(m) || /gemini-exp.*thinking/.test(m);
};

export const modelUsesThinkingBudget = (model?: string): boolean => {
  if (!model) return false;
  const m = model.toLowerCase();
  // Gemini 2.5 family (flash, flash-lite, pro, …)
  return /gemini-2\.5/.test(m);
};

/**
 * Resolve bare reasoning_effort or nested reasoning.effort shorthand.
 * Nested form is the OpenAI Responses API canonical shape.
 */
export const resolveReasoningEffort = (
  params: PortkeyGeminiParams
): string | undefined => {
  if (params.reasoning_effort) return String(params.reasoning_effort);
  const nested = (params as any).reasoning?.effort;
  if (nested != null && nested !== '') return String(nested);
  return undefined;
};

/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini#request_body
 */
export function transformGenerationConfig(params: PortkeyGeminiParams) {
  const generationConfig: Record<string, any> = {};
  if (params['temperature'] != null && params['temperature'] != undefined) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p'] != null && params['top_p'] != undefined) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['top_k'] != null && params['top_k'] != undefined) {
    generationConfig['topK'] = params['top_k'];
  }
  if (params['max_tokens'] != null && params['max_tokens'] != undefined) {
    generationConfig['maxOutputTokens'] = params['max_tokens'];
  }
  if (
    params['max_completion_tokens'] != null &&
    params['max_completion_tokens'] != undefined
  ) {
    generationConfig['maxOutputTokens'] = params['max_completion_tokens'];
  }
  if (params['stop']) {
    generationConfig['stopSequences'] = params['stop'];
  }
  if (params?.response_format?.type === 'json_object') {
    generationConfig['responseMimeType'] = 'application/json';
  }
  if (params['logprobs']) {
    generationConfig['responseLogprobs'] = params['logprobs'];
  }
  if (params['top_logprobs'] != null && params['top_logprobs'] != undefined) {
    generationConfig['logprobs'] = params['top_logprobs']; // range 1-5, openai supports 1-20
  }
  if (params['seed'] != null && params['seed'] != undefined) {
    generationConfig['seed'] = params['seed'];
  }
  if (params?.response_format?.type === 'json_schema') {
    generationConfig['responseMimeType'] = 'application/json';
    let schema =
      params?.response_format?.json_schema?.schema ??
      params?.response_format?.json_schema;
    recursivelyDeleteUnsupportedParameters(schema);
    generationConfig['responseSchema'] = transformGeminiToolParameters(schema);
  }

  if (params?.thinking) {
    const { budget_tokens, type } = params.thinking;
    const thinkingConfig: Record<string, any> = {};
    thinkingConfig['include_thoughts'] =
      type === 'enabled' && budget_tokens ? true : false;
    thinkingConfig['thinking_budget'] = budget_tokens;
    generationConfig['thinking_config'] = thinkingConfig;
  }
  if (params.modalities) {
    generationConfig['responseModalities'] = params.modalities.map((modality) =>
      modality.toUpperCase()
    );
  }
  // Map OpenAI reasoning_effort (or nested reasoning.effort) onto the
  // model-appropriate Gemini thinking field (#1639):
  // - Gemini 2.5 family → thinkingBudget (int; 0 disables, -1 dynamic)
  // - Gemini 3+ → thinkingLevel (MINIMAL/LOW/MEDIUM/HIGH)
  // Previously always emitted thinkingLevel, which Vertex silently drops on
  // 2.5 models — flash-lite defaults thinking off so the no-op is visible.
  const reasoningEffort = resolveReasoningEffort(params);
  if (reasoningEffort && reasoningEffort !== 'none') {
    if (modelUsesThinkingLevel(params.model)) {
      generationConfig['thinkingConfig'] = {
        thinkingLevel: reasoningEffort,
      };
    } else {
      // Gemini 2.5 family, or model unknown: use thinkingBudget so
      // flash-lite (default-off) actually enables thinking.
      const budget = openaiReasoningEffortToThinkingBudget(reasoningEffort);
      if (budget !== undefined) {
        generationConfig['thinkingConfig'] = {
          thinkingBudget: budget,
          includeThoughts: budget !== 0,
        };
      } else {
        // Fall back to thinkingLevel for unrecognized effort strings on
        // unknown models (preserves prior behaviour for custom enums).
        generationConfig['thinkingConfig'] = {
          thinkingLevel: reasoningEffort,
        };
      }
    }
  }
  if (params.image_config) {
    generationConfig['imageConfig'] = {
      ...(params.image_config.aspect_ratio && {
        aspectRatio: params.image_config.aspect_ratio,
      }),
      ...(params.image_config.image_size && {
        imageSize: params.image_config.image_size,
      }),
    };
  }
  return generationConfig;
}

export function transformEmbeddingsParameters(params: GoogleEmbedParams) {
  let embeddingsParameters: Record<string, any> = {};
  if (params['parameters'] && typeof params['parameters'] === 'object') {
    embeddingsParameters = { ...params['parameters'] };
  }
  if (params['dimensions']) {
    // for multimodal embeddings, the parameter is dimension
    if (Array.isArray(params.input) && typeof params.input[0] === 'object') {
      embeddingsParameters['dimension'] = params['dimensions'];
    } else {
      embeddingsParameters['outputDimensionality'] = params['dimensions'];
    }
  }

  return embeddingsParameters;
}

export function transformEmbeddingInputs(params: GoogleEmbedParams) {
  const instances: EmbedInstancesData[] = [];
  if (Array.isArray(params.input)) {
    params.input.forEach((input) => {
      if (typeof input === 'string') {
        instances.push({
          content: input,
          task_type: params.task_type,
        });
      } else if (typeof input === 'object') {
        instances.push({
          text: input.text,
          ...(input.image && {
            image: {
              gcsUri: input.image.url,
              bytesBase64Encoded: input.image.base64,
            },
          }),
          ...(input.video && {
            video: {
              gcsUri: input.video.url,
              bytesBase64Encoded: input.video.base64,
              videoSegmentConfig: {
                startOffsetSec: input.video.start_offset,
                endOffsetSec: input.video.end_offset,
                intervalSec: input.video.interval,
              },
            },
          }),
        });
      }
    });
  } else {
    instances.push({
      content: params.input,
      task_type: params.task_type,
    });
  }
  return instances;
}
