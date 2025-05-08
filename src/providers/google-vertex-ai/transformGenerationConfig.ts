import { Params } from '../../types/requestBody';
import { derefer, recursivelyDeleteUnsupportedParameters } from './utils';
import { GoogleEmbedParams } from './embed';
import { EmbedInstancesData } from './types';
/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini#request_body
 */
export function transformGenerationConfig(params: Params) {
  const generationConfig: Record<string, any> = {};
  if (params['temperature']) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['top_k']) {
    generationConfig['topK'] = params['top_k'];
  }
  if (params['max_tokens']) {
    generationConfig['maxOutputTokens'] = params['max_tokens'];
  }
  if (params['max_completion_tokens']) {
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
  if (params['top_logprobs']) {
    generationConfig['logprobs'] = params['top_logprobs']; // range 1-5, openai supports 1-20
  }
  if (params?.response_format?.type === 'json_schema') {
    generationConfig['responseMimeType'] = 'application/json';
    recursivelyDeleteUnsupportedParameters(
      params?.response_format?.json_schema?.schema
    );
    let schema =
      params?.response_format?.json_schema?.schema ??
      params?.response_format?.json_schema;
    if (Object.keys(schema).includes('$defs')) {
      schema = derefer(schema);
      delete schema['$defs'];
    }
    if (Object.hasOwn(schema, '$schema')) {
      delete schema['$schema'];
    }
    generationConfig['responseSchema'] = schema;
  }

  if (params?.thinking) {
    const thinkingConfig: Record<string, any> = {};
    thinkingConfig['include_thoughts'] = true;
    thinkingConfig['thinking_budget'] = params.thinking.budget_tokens;
    generationConfig['thinking_config'] = thinkingConfig;
  }

  return generationConfig;
}

export function transformEmbeddingInputs(params: GoogleEmbedParams) {
  const instances = Array<EmbedInstancesData>();
  if (params.input) {
    if (Array.isArray(params.input)) {
      params.input.forEach((text) => {
        instances.push({
          content: text,
          task_type: params.task_type,
        });
      });
    } else {
      instances.push({
        content: params.input,
        task_type: params.task_type,
      });
    }
  } else if (params.inputs) {
    params.inputs.forEach((input) => {
      if (input.type === 'text') {
        instances.push({
          content: input.text,
          task_type: params.task_type,
        });
      } else if (input.type === 'image') {
        if (input.image.url) {
          instances.push({
            image: {
              gcsUri: input.image.url,
            },
            text: input.image.text,
          });
        } else if (input.image.base64) {
          instances.push({
            image: {
              bytesBase64Encoded: input.image.base64,
            },
            text: input.image.text,
          });
        }
      } else if (input.type === 'video') {
        if (input.video.url) {
          instances.push({
            video: {
              gcsUri: input.video.url,
            },
            text: input.video.text,
          });
        } else if (input.video.base64) {
          instances.push({
            video: {
              bytesBase64Encoded: input.video.base64,
            },
            text: input.video.text,
          });
        }
      }
    });
  }
  return instances;
}
