import { Params } from '../../types/requestBody';
import { derefer, recursivelyDeleteUnsupportedParameters } from './utils';
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

  return generationConfig;
}
