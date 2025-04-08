import {
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ResponseCreatedEvent,
  ResponseErrorEvent,
  ResponseFileSearchCallCompletedEvent,
  ResponseFileSearchCallInProgressEvent,
  ResponseFileSearchCallSearchingEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseInProgressEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseRefusalDeltaEvent,
  ResponseRefusalDoneEvent,
  ResponseTextAnnotationDeltaEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseWebSearchCallCompletedEvent,
  ResponseWebSearchCallInProgressEvent,
  ResponseWebSearchCallSearchingEvent,
} from '../../types/modelResponses';

export const RESPONSE_ERROR_EVENT: ResponseErrorEvent = {
  type: 'error',
  code: 'ERR_SOMETHING',
  message: 'Something went wrong',
  param: null,
};

//response.created
export const RESPONSE_CREATED_EVENT: ResponseCreatedEvent = {
  type: 'response.created',
  response: {
    id: '',
    object: 'response',
    created_at: 0,
    status: 'in_progress',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: '',
    output: [],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: {
      effort: null,
      generate_summary: null,
    },
    store: true,
    temperature: null,
    text: {
      format: {
        type: 'text',
      },
    },
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    truncation: null,
    usage: null,
    user: null,
    metadata: {},
  },
};

//response.in_progress
export const RESPONSE_IN_PROGRESS_EVENT: ResponseInProgressEvent = {
  type: 'response.in_progress',
  response: {
    id: '',
    object: 'response',
    created_at: 0,
    status: 'in_progress',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: '',
    output: [],
    parallel_tool_calls: false,
    previous_response_id: null,
    reasoning: {
      effort: null,
      generate_summary: null,
    },
    store: false,
    temperature: null,
    text: {
      format: {
        type: 'text',
      },
    },
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    truncation: null,
    usage: null,
    user: null,
    metadata: {},
  },
};

//response.output_item.added message
export const RESPONSE_OUTPUT_MESSAGE_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'message',
      id: '',
      status: 'in_progress',
      role: 'assistant',
      content: [],
    },
  };

export const RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_ADDED_EVENT: ResponseContentPartAddedEvent =
  {
    type: 'response.content_part.added',
    item_id: '',
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: '',
      annotations: [],
    },
  };

export const RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_ADDED_EVENT: ResponseContentPartAddedEvent =
  {
    type: 'response.content_part.added',
    item_id: '',
    output_index: 0,
    content_index: 0,
    part: {
      type: 'refusal',
      refusal: '',
    },
  };

export const RESPONSE_OUTPUT_TEXT_DELTA_EVENT: ResponseTextDeltaEvent = {
  type: 'response.output_text.delta',
  item_id: '',
  output_index: 0,
  content_index: 0,
  delta: '',
};

export const RESPONSE_OUTPUT_TEXT_ANNOTATION_ADDED_EVENT: ResponseTextAnnotationDeltaEvent =
  {
    type: 'response.output_text.annotation.added',
    item_id: '',
    output_index: 1,
    content_index: 0,
    annotation_index: 0,
    annotation: {
      type: 'file_citation',
      index: 390,
      file_id: '',
    },
  };

export const RESPONSE_OUTPUT_TEXT_DONE_EVENT: ResponseTextDoneEvent = {
  type: 'response.output_text.done',
  item_id: '',
  output_index: 0,
  content_index: 0,
  text: '',
};

export const RESPONSE_OUTPUT_REFUSAL_DELTA_EVENT: ResponseRefusalDeltaEvent = {
  type: 'response.refusal.delta',
  item_id: '',
  output_index: 0,
  content_index: 0,
  delta: '',
};

export const RESPONSE_OUTPUT_REFUSAL_DONE_EVENT: ResponseRefusalDoneEvent = {
  type: 'response.refusal.done',
  item_id: '',
  output_index: 1,
  content_index: 2,
  refusal: '',
};

export const RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_DONE_EVENT: ResponseContentPartDoneEvent =
  {
    type: 'response.content_part.done',
    item_id: '',
    output_index: 0,
    content_index: 0,
    part: {
      type: 'refusal',
      refusal: '',
    },
  };

export const RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_DONE_EVENT: ResponseContentPartDoneEvent =
  {
    type: 'response.content_part.done',
    item_id: '',
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: '',
      annotations: [],
    },
  };

//response.output_item.done message
export const RESPONSE_OUTPUT_MESSAGE_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'message',
      id: '',
      status: 'completed',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '',
          annotations: [],
        },
      ],
    },
  };

//response.output_item.added function_call
export const RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'function_call',
      id: '',
      call_id: '',
      name: '',
      arguments: '',
      status: 'in_progress',
    },
  };

//response.function_call_arguments.delta
export const RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DELTA_EVENT: ResponseFunctionCallArgumentsDeltaEvent =
  {
    type: 'response.function_call_arguments.delta',
    item_id: '',
    output_index: 0,
    delta: '',
  };

//response.function_call_arguments.done
export const RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DONE_EVENT: ResponseFunctionCallArgumentsDoneEvent =
  {
    type: 'response.function_call_arguments.done',
    item_id: '',
    output_index: 0,
    arguments: '',
  };

//response.output_item.done function_call
export const RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'function_call',
      id: '',
      call_id: '',
      name: '',
      arguments: '',
      status: 'completed',
    },
  };

//response.output_item.added web_search
export const RESPONSE_OUTPUT_WEB_SEARCH_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'web_search_call',
      id: '',
      status: 'in_progress',
    },
  };

//response.web_search_call.in_progress
export const RESPONSE_OUTPUT_WEB_SEARCH_CALL_IN_PROGRESS_EVENT: ResponseWebSearchCallInProgressEvent =
  {
    type: 'response.web_search_call.in_progress',
    output_index: 0,
    item_id: '',
  };

//response.web_search_call.searching
export const RESPONSE_OUTPUT_WEB_SEARCH_CALL_SEARCHING_EVENT: ResponseWebSearchCallSearchingEvent =
  {
    type: 'response.web_search_call.searching',
    output_index: 0,
    item_id: '',
  };

//response.web_search_call.completed
export const RESPONSE_OUTPUT_WEB_SEARCH_CALL_COMPLETED_EVENT: ResponseWebSearchCallCompletedEvent =
  {
    type: 'response.web_search_call.completed',
    output_index: 0,
    item_id: '',
  };

export const RESPONSE_OUTPUT_WEB_SEARCH_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'web_search_call',
      id: '',
      status: 'completed',
    },
  };

export const RESPONSE_OUTPUT_FILE_SEARCH_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'file_search_call',
      id: '',
      queries: [],
      results: [],
      status: 'in_progress',
    },
  };

export const RESPONSE_OUTPUT_FILE_SEARCH_CALL_IN_PROGRESS_EVENT: ResponseFileSearchCallInProgressEvent =
  {
    type: 'response.file_search_call.in_progress',
    output_index: 0,
    item_id: '',
  };

export const RESPONSE_OUTPUT_FILE_SEARCH_CALL_SEARCHING_EVENT: ResponseFileSearchCallSearchingEvent =
  {
    type: 'response.file_search_call.searching',
    output_index: 0,
    item_id: '',
  };

export const RESPONSE_OUTPUT_FILE_SEARCH_CALL_COMPLETED_EVENT: ResponseFileSearchCallCompletedEvent =
  {
    type: 'response.file_search_call.completed',
    output_index: 0,
    item_id: '',
  };

export const RESPONSE_OUTPUT_FILE_SEARCH_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'file_search_call',
      id: '',
      queries: [],
      results: [],
      status: 'completed',
    },
  };

export const RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'computer_call',
      id: '',
      call_id: '',
      action: null,
      pending_safety_checks: [],
      status: 'in_progress',
    },
  };

export const RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'computer_call',
      id: '',
      call_id: '',
      action: null,
      pending_safety_checks: [],
      status: 'completed',
    },
  };

export const RESPONSE_OUTPUT_REASONING_ITEM_ADDED_EVENT: ResponseOutputItemAddedEvent =
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'reasoning',
      id: 'rs_67f52cb87b7c819198a16adfae0eb05004a13d81bd64355b',
      summary: [],
    },
  };

export const RESPONSE_OUTPUT_REASONING_ITEM_DONE_EVENT: ResponseOutputItemDoneEvent =
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: {
      type: 'reasoning',
      id: 'rs_67f52cb87b7c819198a16adfae0eb05004a13d81bd64355b',
      summary: [],
    },
  };
