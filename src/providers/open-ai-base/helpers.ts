import {
  OpenAIResponse,
  ResponseCreatedEvent,
  ResponseFunctionCallArgumentsDeltaEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseInProgressEvent,
  ResponseOutputItemAddedEvent,
  ResponseOutputItemDoneEvent,
  ResponseOutputItem,
  ResponseFunctionToolCall,
  ResponseCompletedEvent,
  ResponseFunctionWebSearch,
  ResponseWebSearchCallInProgressEvent,
  ResponseWebSearchCallSearchingEvent,
  ResponseWebSearchCallCompletedEvent,
  ResponseOutputMessage,
  ResponseFileSearchToolCall,
  ResponseFileSearchCallInProgressEvent,
  ResponseFileSearchCallSearchingEvent,
  ResponseFileSearchCallCompletedEvent,
  ResponseOutputText,
  ResponseContentPartAddedEvent,
  ResponseContentPartDoneEvent,
  ResponseTextDeltaEvent,
  ResponseTextDoneEvent,
  ResponseOutputRefusal,
  ResponseRefusalDeltaEvent,
  ResponseRefusalDoneEvent,
  ResponseError,
  ResponseErrorEvent,
  ResponseFailedEvent,
  ResponseIncompleteEvent,
  ResponseComputerToolCall,
  ResponseOutputItemReasoning,
} from '../../types/modelResponses';
import {
  RESPONSE_CREATED_EVENT,
  RESPONSE_IN_PROGRESS_EVENT,
  RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DELTA_EVENT,
  RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DONE_EVENT,
  RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_DONE_EVENT,
  RESPONSE_OUTPUT_MESSAGE_ITEM_DONE_EVENT,
  RESPONSE_OUTPUT_MESSAGE_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_WEB_SEARCH_CALL_COMPLETED_EVENT,
  RESPONSE_OUTPUT_WEB_SEARCH_CALL_IN_PROGRESS_EVENT,
  RESPONSE_OUTPUT_WEB_SEARCH_CALL_SEARCHING_EVENT,
  RESPONSE_OUTPUT_WEB_SEARCH_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_WEB_SEARCH_ITEM_DONE_EVENT,
  RESPONSE_OUTPUT_FILE_SEARCH_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_FILE_SEARCH_CALL_IN_PROGRESS_EVENT,
  RESPONSE_OUTPUT_FILE_SEARCH_CALL_SEARCHING_EVENT,
  RESPONSE_OUTPUT_FILE_SEARCH_CALL_COMPLETED_EVENT,
  RESPONSE_OUTPUT_FILE_SEARCH_ITEM_DONE_EVENT,
  RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_ADDED_EVENT,
  RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_DONE_EVENT,
  RESPONSE_OUTPUT_TEXT_DELTA_EVENT,
  RESPONSE_OUTPUT_TEXT_DONE_EVENT,
  RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_ADDED_EVENT,
  RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_DONE_EVENT,
  RESPONSE_OUTPUT_REFUSAL_DELTA_EVENT,
  RESPONSE_OUTPUT_REFUSAL_DONE_EVENT,
  RESPONSE_ERROR_EVENT,
  RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_DONE_EVENT,
  RESPONSE_OUTPUT_REASONING_ITEM_ADDED_EVENT,
  RESPONSE_OUTPUT_REASONING_ITEM_DONE_EVENT,
} from './constants';

export const getRandomId = () => {
  return 'portkey_cache_' + crypto.randomUUID();
};

export const getResponseErrorEvent = (error: ResponseError): string => {
  const template: ResponseErrorEvent = { ...RESPONSE_ERROR_EVENT };
  template.code = error.code;
  template.message = error.message;
  return `event: error\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseFailedEvent = (response: OpenAIResponse): string => {
  const chunk: ResponseFailedEvent = {
    type: 'response.failed',
    response: { ...response },
  };
  chunk.response.created_at = Math.floor(Date.now() / 1000);
  chunk.response.id = getRandomId();
  return `event: response.failed\ndata: ${JSON.stringify(chunk)}\n\n`;
};

export const getResponseIncompleteEvent = (
  response: OpenAIResponse
): string => {
  const chunk: ResponseIncompleteEvent = {
    type: 'response.incomplete',
    response: { ...response },
  };
  chunk.response.created_at = Math.floor(Date.now() / 1000);
  chunk.response.id = getRandomId();
  return `event: response.incomplete\ndata: ${JSON.stringify(chunk)}\n\n`;
};

// response.created
export const getResponseCreatedEvent = (
  finalResponse: OpenAIResponse,
  responseId: string
): string => {
  const template: ResponseCreatedEvent = {
    ...RESPONSE_CREATED_EVENT,
  };
  template.response = { ...finalResponse };
  template.response.output = [];
  template.response.created_at = Math.floor(Date.now() / 1000);
  template.response.id = responseId;
  return `event: response.created\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.in_progress
export const getResponseInProgressEvent = (
  finalResponse: OpenAIResponse,
  responseId: string
): string => {
  const template: ResponseInProgressEvent = {
    ...RESPONSE_IN_PROGRESS_EVENT,
  };
  template.response = { ...finalResponse };
  template.response.output = [];
  template.response.created_at = Math.floor(Date.now() / 1000);
  template.response.id = responseId;
  return `event: response.in_progress\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.completed
export const getResponseCompletedEvent = (
  finalResponse: OpenAIResponse,
  responseId: string
): string => {
  const template: ResponseCompletedEvent = {
    type: 'response.completed',
    response: { ...finalResponse },
  };
  template.response.id = responseId;
  template.response.created_at = Math.floor(Date.now() / 1000);
  return `event: response.completed\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added message
export const getResponseOutputMessageItemAddedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseOutputItem = template.item as ResponseOutputItem;
  item.id = outputItemId;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageOutputTextContentPartAddedEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number
): string => {
  const template: ResponseContentPartAddedEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_ADDED_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  return `event: response.content_part.added\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageOutputTextContentPartDeltaEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  delta: string
): string => {
  const template: ResponseTextDeltaEvent = {
    ...RESPONSE_OUTPUT_TEXT_DELTA_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.delta = delta;
  return `event: response.output_text.delta\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputTextDoneEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  contentPart: ResponseOutputText
): string => {
  const template: ResponseTextDoneEvent = {
    ...RESPONSE_OUTPUT_TEXT_DONE_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.text = contentPart.text;
  return `event: response.output_text.done\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageOutputTextContentPartDoneEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  contentPart: ResponseOutputText
): string => {
  const template: ResponseContentPartDoneEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_OUTPUT_TEXT_CONTENT_PART_DONE_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.part = contentPart;
  return `event: response.content_part.done\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageRefusalContentPartAddedEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number
): string => {
  const template: ResponseContentPartAddedEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_ADDED_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  return `event: response.content_part.added\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageRefusalContentPartDeltaEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  delta: string
): string => {
  const template: ResponseRefusalDeltaEvent = {
    ...RESPONSE_OUTPUT_REFUSAL_DELTA_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.delta = delta;
  return `event: response.refusal.delta\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageRefusalDoneEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  contentPart: ResponseOutputRefusal
): string => {
  const template: ResponseRefusalDoneEvent = {
    ...RESPONSE_OUTPUT_REFUSAL_DONE_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.refusal = contentPart.refusal;
  return `event: response.refusal.done\ndata: ${JSON.stringify(template)}\n\n`;
};

export const getResponseOutputMessageRefusalContentPartDoneEvent = (
  index: number,
  outputItemId: string,
  contentPartIndex: number,
  contentPart: ResponseOutputRefusal
): string => {
  const template: ResponseContentPartDoneEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_REFUSAL_CONTENT_PART_DONE_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  template.content_index = contentPartIndex;
  template.part = contentPart;
  return `event: response.content_part.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.done message
export const getResponseOutputMessageItemDoneEvent = (
  index: number,
  outputItemId: string,
  contentItem: ResponseOutputMessage
): string => {
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_MESSAGE_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseOutputMessage = template.item as ResponseOutputMessage;
  item.id = outputItemId;
  item.content = contentItem.content;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added function_call
export const getResponseOutputFunctionCallItemAddedEvent = (
  index: number,
  outputItemId: string,
  functionCallId: string,
  outputItem: ResponseOutputItem
): string => {
  if (outputItem.type !== 'function_call') return '\n\n'; // TOOD: this is for type safety, make it prettier
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseFunctionToolCall =
    template.item as ResponseFunctionToolCall;
  item.id = outputItemId;
  item.call_id = functionCallId;
  item.name = outputItem.name;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.function_call_arguments.delta
// we could return this as multiple events, but one delta event is enough for now
export const getResponseFunctionCallArgumentsDeltaEvents = (
  index: number,
  itemId: string,
  contentItem: ResponseFunctionToolCall
): string => {
  const template: ResponseFunctionCallArgumentsDeltaEvent = {
    ...RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DELTA_EVENT,
  };
  template.output_index = index;
  template.item_id = itemId;
  template.delta = contentItem.arguments;
  return `event: response.function_call_arguments.delta\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.function_call_arguments.done
export const getResponseFunctionCallArgumentsDoneEvent = (
  index: number,
  itemId: string,
  contentItem: ResponseFunctionToolCall
): string => {
  const template: ResponseFunctionCallArgumentsDoneEvent = {
    ...RESPONSE_OUTPUT_FUNCTION_CALL_ARGUMENTS_DONE_EVENT,
  };
  template.output_index = index;
  template.item_id = itemId;
  template.arguments = contentItem.arguments;
  return `event: response.function_call_arguments.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response function call item done
export const getResponseOutputFunctionCallItemDoneEvent = (
  index: number,
  outputItemId: string,
  functionCallId: string,
  contentItem: ResponseOutputItem
): string => {
  if (contentItem.type !== 'function_call') return '\n\n'; // TOOD: this is for type safety, make it prettier
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_FUNCTION_CALL_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseFunctionToolCall =
    template.item as ResponseFunctionToolCall;
  item.id = outputItemId;
  item.call_id = functionCallId;
  item.name = contentItem.name;
  item.arguments = contentItem.arguments;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added web_search
export const getResponseOutputWebSearchItemAddedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_WEB_SEARCH_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseFunctionWebSearch =
    template.item as ResponseFunctionWebSearch;
  item.id = outputItemId;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.web_search_call.in_progress
export const getResponseOutputWebSearchCallInProgressEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseWebSearchCallInProgressEvent = {
    ...RESPONSE_OUTPUT_WEB_SEARCH_CALL_IN_PROGRESS_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.web_search_call.in_progress\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.web_search_call.searching
export const getResponseOutputWebSearchCallSearchingEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseWebSearchCallSearchingEvent = {
    ...RESPONSE_OUTPUT_WEB_SEARCH_CALL_SEARCHING_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.web_search_call.searching\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.web_search_call.completed
export const getResponseOutputWebSearchCallCompletedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseWebSearchCallCompletedEvent = {
    ...RESPONSE_OUTPUT_WEB_SEARCH_CALL_COMPLETED_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.web_search_call.completed\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.done web_search
export const getResponseOutputWebSearchItemDoneEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_WEB_SEARCH_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseFunctionWebSearch =
    template.item as ResponseFunctionWebSearch;
  item.id = outputItemId;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added file_search
export const getResponseOutputFileSearchItemAddedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_FILE_SEARCH_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseFileSearchToolCall =
    template.item as ResponseFileSearchToolCall;
  item.id = outputItemId;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.file_search_call.in_progress
export const getResponseOutputFileSearchCallInProgressEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseFileSearchCallInProgressEvent = {
    ...RESPONSE_OUTPUT_FILE_SEARCH_CALL_IN_PROGRESS_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.file_search_call.in_progress\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.file_search_call.searching
export const getResponseOutputFileSearchCallSearchingEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseFileSearchCallSearchingEvent = {
    ...RESPONSE_OUTPUT_FILE_SEARCH_CALL_SEARCHING_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.file_search_call.searching\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.file_search_call.completed
export const getResponseOutputFileSearchCallCompletedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseFileSearchCallCompletedEvent = {
    ...RESPONSE_OUTPUT_FILE_SEARCH_CALL_COMPLETED_EVENT,
  };
  template.output_index = index;
  template.item_id = outputItemId;
  return `event: response.file_search_call.completed\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.done file_search
export const getResponseOutputFileSearchItemDoneEvent = (
  index: number,
  outputItemId: string,
  contentItem: ResponseOutputItem
): string => {
  if (contentItem.type !== 'file_search_call') return '\n\n'; // TOOD: this is for type safety, make it prettier
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_FILE_SEARCH_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseFileSearchToolCall =
    template.item as ResponseFileSearchToolCall;
  item.id = outputItemId;
  item.queries = contentItem.queries;
  item.results = contentItem.results;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added computer_call
export const getResponseOutputComputerCallItemAddedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseComputerToolCall =
    template.item as ResponseComputerToolCall;
  item.id = outputItemId;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.done computer_call
export const getResponseOutputComputerCallItemDoneEvent = (
  index: number,
  outputItemId: string,
  contentItem: ResponseOutputItem
): string => {
  if (contentItem.type !== 'computer_call') return '\n\n'; // TOOD: this is for type safety, make it prettier
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_COMPUTER_CALL_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseComputerToolCall =
    template.item as ResponseComputerToolCall;
  item.id = outputItemId;
  item.call_id = contentItem.call_id;
  item.action = contentItem.action;
  item.pending_safety_checks = contentItem.pending_safety_checks;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.added reasoning
export const getResponseOutputReasoningItemAddedEvent = (
  index: number,
  outputItemId: string
): string => {
  const template: ResponseOutputItemAddedEvent = {
    ...RESPONSE_OUTPUT_REASONING_ITEM_ADDED_EVENT,
  };
  template.output_index = index;
  const item: ResponseOutputItemReasoning =
    template.item as ResponseOutputItemReasoning;
  item.id = outputItemId;
  return `event: response.output_item.added\ndata: ${JSON.stringify(template)}\n\n`;
};

// response.output_item.done reasoning
export const getResponseOutputReasoningItemDoneEvent = (
  index: number,
  outputItemId: string,
  contentItem: ResponseOutputItem
): string => {
  if (contentItem.type !== 'reasoning') return '\n\n'; // TOOD: this is for type safety, make it prettier
  const template: ResponseOutputItemDoneEvent = {
    ...RESPONSE_OUTPUT_REASONING_ITEM_DONE_EVENT,
  };
  template.output_index = index;
  const item: ResponseOutputItemReasoning =
    template.item as ResponseOutputItemReasoning;
  item.id = outputItemId;
  item.summary = contentItem.summary;
  return `event: response.output_item.done\ndata: ${JSON.stringify(template)}\n\n`;
};
