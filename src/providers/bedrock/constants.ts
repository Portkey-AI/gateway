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
