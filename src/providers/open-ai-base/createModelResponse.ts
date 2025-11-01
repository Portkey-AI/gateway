import { ProviderConfig } from '../types';
import { OpenAIResponse } from '../../types/modelResponses';
import {
  getRandomId,
  getResponseCompletedEvent,
  getResponseOutputFileSearchCallCompletedEvent,
  getResponseOutputFileSearchCallInProgressEvent,
  getResponseOutputFileSearchCallSearchingEvent,
  getResponseOutputFileSearchItemAddedEvent,
  getResponseOutputFileSearchItemDoneEvent,
  getResponseOutputMessageItemAddedEvent,
  getResponseOutputMessageItemDoneEvent,
  getResponseOutputMessageOutputTextContentPartAddedEvent,
  getResponseOutputMessageOutputTextContentPartDeltaEvent,
  getResponseOutputMessageOutputTextContentPartDoneEvent,
  getResponseOutputMessageRefusalContentPartAddedEvent,
  getResponseOutputMessageRefusalContentPartDeltaEvent,
  getResponseOutputTextDoneEvent,
  getResponseOutputWebSearchCallCompletedEvent,
  getResponseOutputWebSearchCallInProgressEvent,
  getResponseOutputWebSearchCallSearchingEvent,
  getResponseOutputWebSearchItemAddedEvent,
  getResponseOutputWebSearchItemDoneEvent,
  getResponseOutputMessageRefusalDoneEvent,
  getResponseOutputMessageRefusalContentPartDoneEvent,
  getResponseErrorEvent,
  getResponseFailedEvent,
  getResponseIncompleteEvent,
  getResponseCreatedEvent,
  getResponseFunctionCallArgumentsDeltaEvents,
  getResponseInProgressEvent,
  getResponseOutputFunctionCallItemAddedEvent,
  getResponseOutputFunctionCallItemDoneEvent,
  getResponseOutputComputerCallItemDoneEvent,
  getResponseOutputComputerCallItemAddedEvent,
  getResponseOutputReasoningItemDoneEvent,
  getResponseOutputReasoningItemAddedEvent,
} from './helpers';

export const OpenAICreateModelResponseConfig: ProviderConfig = {
  background: {
    param: 'background',
    required: false,
  },
  conversation: {
    param: 'conversation',
    required: false,
  },
  input: {
    param: 'input',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  include: {
    param: 'include',
    required: false,
  },
  instructions: {
    param: 'instructions',
    required: false,
  },
  max_tool_calls: {
    param: 'max_tool_calls',
    required: false,
  },
  max_output_tokens: {
    param: 'max_output_tokens',
    required: false,
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  modalities: {
    param: 'modalities',
    required: false,
  },
  parallel_tool_calls: {
    param: 'parallel_tool_calls',
    required: false,
  },
  previous_response_id: {
    param: 'previous_response_id',
    required: false,
  },
  prompt: {
    param: 'prompt',
    required: false,
  },
  prompt_cache_key: {
    param: 'prompt_cache_key',
    required: false,
  },
  reasoning: {
    param: 'reasoning',
    required: false,
  },
  safety_identifier: {
    param: 'safety_identifier',
    required: false,
  },
  service_tier: {
    param: 'service_tier',
    required: false,
  },
  store: {
    param: 'store',
    required: false,
  },
  stream: {
    param: 'stream',
    required: false,
  },
  stream_options: {
    param: 'stream_options',
    required: false,
  },
  temperature: {
    param: 'temperature',
    required: false,
  },
  text: {
    param: 'text',
    required: false,
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
  },
  tools: {
    param: 'tools',
    required: false,
  },
  top_logprobs: {
    param: 'top_logprobs',
    required: false,
  },
  top_p: {
    param: 'top_p',
    required: false,
  },
  truncation: {
    param: 'truncation',
    required: false,
  },
  user: {
    param: 'user',
    required: false,
  },
  verbosity: {
    param: 'verbosity',
    required: false,
  },
};

export function* OpenAIModelResponseJSONToStreamGenerator(
  response: OpenAIResponse
): Generator<string, void, unknown> {
  if (response.error?.code) {
    yield getResponseErrorEvent(response.error);
    return;
  }

  if (response.status === 'failed') {
    yield getResponseFailedEvent(response);
    return;
  }

  if (response.status === 'incomplete') {
    yield getResponseIncompleteEvent(response);
    return;
  }

  const responseId = getRandomId();
  yield getResponseCreatedEvent(response, responseId);
  yield getResponseInProgressEvent(response, responseId);
  for (const [index, outputItem] of response.output.entries()) {
    const outputItemId = getRandomId();
    if (outputItem.type === 'function_call') {
      const functionCallId = getRandomId();
      yield getResponseOutputFunctionCallItemAddedEvent(
        index,
        outputItemId,
        functionCallId,
        outputItem
      );
      yield getResponseFunctionCallArgumentsDeltaEvents(
        index,
        outputItemId,
        outputItem
      );
      yield getResponseOutputFunctionCallItemDoneEvent(
        index,
        outputItemId,
        functionCallId,
        outputItem
      );
    } else if (outputItem.type === 'web_search_call') {
      yield getResponseOutputWebSearchItemAddedEvent(index, outputItemId);
      yield getResponseOutputWebSearchCallInProgressEvent(index, outputItemId);
      yield getResponseOutputWebSearchCallSearchingEvent(index, outputItemId);
      yield getResponseOutputWebSearchCallCompletedEvent(index, outputItemId);
      yield getResponseOutputWebSearchItemDoneEvent(index, outputItemId);
    } else if (outputItem.type === 'file_search_call') {
      // TODO: validate this
      yield getResponseOutputFileSearchItemAddedEvent(index, outputItemId);
      yield getResponseOutputFileSearchCallInProgressEvent(index, outputItemId);
      yield getResponseOutputFileSearchCallSearchingEvent(index, outputItemId);
      yield getResponseOutputFileSearchCallCompletedEvent(index, outputItemId);
      yield getResponseOutputFileSearchItemDoneEvent(
        index,
        outputItemId,
        outputItem
      );
    } else if (outputItem.type === 'computer_call') {
      yield getResponseOutputComputerCallItemAddedEvent(index, outputItemId);
      yield getResponseOutputComputerCallItemDoneEvent(
        index,
        outputItemId,
        outputItem
      );
    } else if (outputItem.type === 'reasoning') {
      yield getResponseOutputReasoningItemAddedEvent(index, outputItemId);
      yield getResponseOutputReasoningItemDoneEvent(
        index,
        outputItemId,
        outputItem
      );
    } else if (outputItem.type === 'message') {
      yield getResponseOutputMessageItemAddedEvent(index, outputItemId);
      for (const [
        contentPartIndex,
        contentPart,
      ] of outputItem.content.entries()) {
        if (contentPart.type === 'output_text') {
          yield getResponseOutputMessageOutputTextContentPartAddedEvent(
            index,
            outputItemId,
            contentPartIndex
          );
          for (let i = 0; i < contentPart.text.length; i += 500) {
            yield getResponseOutputMessageOutputTextContentPartDeltaEvent(
              index,
              outputItemId,
              contentPartIndex,
              contentPart.text.slice(i, i + 500)
            );
          }
          yield getResponseOutputTextDoneEvent(
            index,
            outputItemId,
            contentPartIndex,
            contentPart
          );
          yield getResponseOutputMessageOutputTextContentPartDoneEvent(
            index,
            outputItemId,
            contentPartIndex,
            contentPart
          );
        } else if (contentPart.type === 'refusal') {
          yield getResponseOutputMessageRefusalContentPartAddedEvent(
            index,
            outputItemId,
            contentPartIndex
          );
          for (let i = 0; i < contentPart.refusal.length; i += 500) {
            yield getResponseOutputMessageRefusalContentPartDeltaEvent(
              index,
              outputItemId,
              contentPartIndex,
              contentPart.refusal.slice(i, i + 500)
            );
          }
          yield getResponseOutputMessageRefusalDoneEvent(
            index,
            outputItemId,
            contentPartIndex,
            contentPart
          );
          yield getResponseOutputMessageRefusalContentPartDoneEvent(
            index,
            outputItemId,
            contentPartIndex,
            contentPart
          );
        }
      }
      yield getResponseOutputMessageItemDoneEvent(
        index,
        outputItemId,
        outputItem
      );
    }
  }
  yield getResponseCompletedEvent(response, responseId);
}
