export const LLAMA_2_SPECIAL_TOKENS = {
  BEGINNING_OF_SENTENCE: '<s>',
  END_OF_SENTENCE: '</s>',
  CONVERSATION_TURN_START: '[INST]',
  CONVERSATION_TURN_END: '[/INST]',
  SYSTEM_MESSAGE_START: '<<SYS>>\n',
  SYSTEM_MESSAGE_END: '\n<</SYS>>\n\n',
};

export const LLAMA_3_SPECIAL_TOKENS = {
  PROMPT_START: '<|begin_of_text|>',
  PROMPT_END: '<|end_of_text|>',
  PADDING: '<|finetune_right_pad_id|>',
  ROLE_START: '<|start_header_id|>',
  ROLE_END: '<|end_header_id|>',
  END_OF_MESSAGE: '<|eom_id|>',
  END_OF_TURN: '<|eot_id|>',
  TOOL_CALL: '<|python_tag|>',
};

export const MISTRAL_CONTROL_TOKENS = {
  UNKNOWN: '<unk>',
  BEGINNING_OF_SENTENCE: '<s>',
  END_OF_SENTENCE: '</s>',
  CONVERSATION_TURN_START: '[INST]',
  CONVERSATION_TURN_END: '[/INST]',
  AVAILABLE_TOOLS_START: '[AVAILABLE_TOOLS]',
  AVAILABLE_TOOLS_END: '[/AVAILABLE_TOOLS]',
  TOOL_RESULTS_START: '[TOOL_RESULTS]',
  TOOL_RESULTS_END: '[/TOOL_RESULTS]',
  TOOL_CALLS_START: '[TOOL_CALLS]',
  PADDING: '<pad>',
  PREFIX: '[PREFIX]',
  MIDDLE: '[MIDDLE]',
  SUFFIX: '[SUFFIX]',
};

export const BEDROCK_STABILITY_V1_MODELS = [
  'stable-diffusion-xl-v0',
  'stable-diffusion-xl-v1',
];

export const bedrockInvokeModels = [
  'cohere.command-light-text-v14',
  'cohere.command-text-v14',
  'ai21.j2-mid-v1',
  'ai21.j2-ultra-v1',
];
