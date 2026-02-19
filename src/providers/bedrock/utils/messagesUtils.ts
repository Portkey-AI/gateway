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
        });
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
