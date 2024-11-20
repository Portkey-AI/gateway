import { Context } from 'hono';
import { ProviderAPIConfig } from '../providers/types';
import { Options } from '../types/requestBody';

enum ClientEventTypes {
  SESSION_UPDATE = 'session.update',
  INPUT_AUDIO_BUFFER_APPEND = 'input_audio_buffer.append',
  INPUT_AUDIO_BUFFER_COMMIT = 'input_audio_buffer.commit',
  INPUT_AUDIO_BUFFER_CLEAR = 'input_audio_buffer.clear',
  CONVERSATION_ITEM_CREATE = 'conversation.item.create',
  CONVERSATION_ITEM_TRUNCATE = 'conversation.item.truncate',
  CONVERSATION_ITEM_DELETE = 'conversation.item.delete',
  RESPONSE_CREATE = 'response.create',
  RESPONSE_CANCEL = 'response.cancel',
}

enum ServerEventTypes {
  ERROR = 'error',
  SESSION_CREATED = 'session.created',
  SESSION_UPDATED = 'session.updated',
  CONVERSATION_CREATED = 'conversation.created',
  CONVERSATION_ITEM_CREATED = 'conversation.item.created',
  CONVERSATION_ITEM_INPUT_AUDIO_TRANSCRIPTION_COMPLETED = 'conversation.item.input_audio_transcription.completed',
  CONVERSATION_ITEM_OUTPUT_AUDIO_TRANSCRIPTION_FAILED = 'conversation.item.output_audio_transcription.failed',
  CONVERSATION_ITEM_TRUNCATED = 'conversation.item.truncated',
  CONVERSATION_ITEM_DELETED = 'conversation.item.deleted',
  INPUT_AUDIO_BUFFER_COMMITTED = 'input_audio_buffer.committed',
  INPUT_AUDIO_BUFFER_CLEARED = 'input_audio_buffer.cleared',
  INPUT_AUDIO_BUFFER_SPEECH_STARTED = 'input_audio_buffer.speech_started',
  INPUT_AUDIO_BUFFER_SPEECH_STOPPED = 'input_audio_buffer.speech_stopped',
  RESPONSE_CREATED = 'response.created',
  RESPONSE_DONE = 'response.done',
  RESPONSE_OUTPUT_ITEM_ADDED = 'response.output_item.added',
  RESPONSE_OUTPUT_ITEM_DONE = 'response.output_item.done',
  RESPONSE_CONTENT_PART_ADDED = 'response.content_part.added',
  RESPONSE_CONTENT_PART_DONE = 'response.content_part.done',
  RESPONSE_TEXT_DELTA = 'response.text.delta',
  RESPONSE_TEXT_DONE = 'response.text.done',
  RESPONSE_AUDIO_TRANSCRIPT_DELTA = 'response.audio_transcript.delta',
  RESPONSE_AUDIO_TRANSCRIPT_DONE = 'response.audio_transcript.done',
  RESPONSE_AUDIO_DELTA = 'response.audio.delta',
  RESPONSE_AUDIO_DONE = 'response.audio.done',
  RESPONSE_FUNCTION_CALL_ARGUMENTS_DELTA = 'response.function_call_arguments.delta',
  RESPONSE_FUNCTION_CALL_ARGUMENTS_DONE = 'response.function_call_arguments.done',
  RESPONSE_RATE_LIMITS_UPDATED = 'response.rate_limits.updated',
}

export const addListeners = (
  outgoingWebSocket: WebSocket,
  server: WebSocket,
  c: Context,
  url: string
) => {
  let events: { [key: string]: any }[] = [];

  outgoingWebSocket.addEventListener('message', (event) => {
    server?.send(event.data as string);
    const parsedData = JSON.parse(event.data as string);
    parsedData.createdAt = new Date();
    events.push(parsedData);
  });

  outgoingWebSocket.addEventListener('close', (event) => {
    server?.close();
  });

  outgoingWebSocket.addEventListener('error', (event) => {
    console.log('outgoingWebSocket error', event);
    server?.close();
  });

  server.addEventListener('message', (event) => {
    outgoingWebSocket?.send(event.data as string);
    try {
      const parsedData = JSON.parse(event.data as string);
      parsedData.createdAt = new Date();
      events.push(parsedData);
    } catch (error) {
      console.log('error parsing event', error);
    }
  });

  server.addEventListener('close', (event) => {
    outgoingWebSocket?.close();
    c.set('requestOptions', createRequestOption(url, events));
  });

  server.addEventListener('error', (event) => {
    console.log('serverWebSocket error', event);
    outgoingWebSocket?.close();
  });
};

export const createRequestOption = (
  url: string,
  events: { [key: string]: any }[]
) => {
  const cleanedEvents = events.map((event) => {
    if (event.type === ClientEventTypes.INPUT_AUDIO_BUFFER_APPEND) {
      return {
        event_id: event.event_id,
        type: event.type,
      };
    }
    if (event.type === ServerEventTypes.RESPONSE_AUDIO_DELTA) {
      return {
        event_id: event.event_id,
        type: event.type,
        response_id: event.response_id,
      };
    }
    return event;
  });
  return {
    providerOptions: {
      requestURL: url,
      rubeusURL: 'realtime',
    },
    events: cleanedEvents,
  };
};

export const getOptionsForOutgoingConnection = async (
  apiConfig: ProviderAPIConfig,
  providerOptions: Options,
  url: string,
  c: Context
) => {
  const headers = await apiConfig.headers({
    c,
    providerOptions,
    fn: 'realtime',
    transformedRequestUrl: url,
    transformedRequestBody: {},
  });
  headers['Upgrade'] = 'websocket';
  headers['Connection'] = 'Keep-Alive';
  headers['Keep-Alive'] = 'timeout=600';
  return {
    headers,
    method: 'GET',
  };
};

export const getURLForOutgoingConnection = (
  apiConfig: ProviderAPIConfig,
  providerOptions: Options,
  gatewayRequestURL: string
) => {
  const baseUrl = apiConfig.getBaseURL({ providerOptions });
  const endpoint = apiConfig.getEndpoint({
    providerOptions,
    fn: 'realtime',
    gatewayRequestBody: {},
    gatewayRequestURL: gatewayRequestURL,
  });
  return `${baseUrl}${endpoint}`;
};
