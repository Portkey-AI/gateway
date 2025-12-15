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
        const toolSpec: Record<string, any> = {
          name: tool.name,
          inputSchema: { json: tool.input_schema },
          description: tool.description,
        };

        // Pass through advanced tool use properties if present
        // Users must provide appropriate beta header (e.g., tool-search-tool-2025-10-19)
        if (tool.defer_loading !== undefined) {
          toolSpec.defer_loading = tool.defer_loading;
        }
        if (tool.allowed_callers) {
          toolSpec.allowed_callers = tool.allowed_callers;
        }
        if (tool.input_examples) {
          toolSpec.input_examples = tool.input_examples;
        }

        tools.push({ toolSpec });

        if (tool.cache_control) {
          tools.push({
            cachePoint: {
              type: 'default',
            },
          });
        }
      }
    }
  }
  if (tools.length === 0) {
    return null;
  }
  return { tools, toolChoice };
};
