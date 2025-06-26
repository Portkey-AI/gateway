import { BedrockMessagesParams } from '../types';

export const transformInferenceConfig = (params: BedrockMessagesParams) => {
  const inferenceConfig: Record<string, any> = {};
  if (params['max_tokens']) {
    inferenceConfig['maxTokens'] = params['max_tokens'];
  }
  if (params['temperature']) {
    inferenceConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    inferenceConfig['topP'] = params['top_p'];
  }
  if (params['stop_sequences']) {
    inferenceConfig['stopSequences'] = params['stop_sequences'];
  }
  return inferenceConfig;
};

export const transformAnthropicAdditionalModelRequestFields = (
  params: BedrockMessagesParams
) => {
  const additionalModelRequestFields: Record<string, any> =
    params.additionalModelRequestFields ||
    params.additional_model_request_fields ||
    {};
  if (params['top_k']) {
    additionalModelRequestFields['top_k'] = params['top_k'];
  }
  if (params['anthropic_version']) {
    additionalModelRequestFields['anthropic_version'] =
      params['anthropic_version'];
  }
  if (params['thinking']) {
    additionalModelRequestFields['thinking'] = params['thinking'];
  }
  if (params['anthropic_beta']) {
    if (typeof params['anthropic_beta'] === 'string') {
      additionalModelRequestFields['anthropic_beta'] = [
        params['anthropic_beta'],
      ];
    } else {
      additionalModelRequestFields['anthropic_beta'] = params['anthropic_beta'];
    }
  }
  return additionalModelRequestFields;
};

export const transformToolsConfig = (params: BedrockMessagesParams) => {
  let toolChoice = undefined;
  let tools = [];
  if (params.tool_choice) {
    if (params.tool_choice.type === 'auto') {
      toolChoice = {
        auto: {},
      };
    } else if (params.tool_choice.type === 'any') {
      toolChoice = {
        any: {},
      };
    } else if (params.tool_choice.type === 'tool') {
      toolChoice = {
        tool: {
          name: params.tool_choice.name,
        },
      };
    }
  }
  if (params.tools) {
    for (const tool of params.tools) {
      if (tool.type === 'custom' || !tool.type) {
        tools.push({
          toolSpec: {
            name: tool.name,
            inputSchema: { json: tool.input_schema },
            description: tool.description,
          },
          ...(tool.cache_control && {
            cachePoint: {
              type: 'default',
            },
          }),
        });
      }
    }
  }
  return { tools, toolChoice };
};
