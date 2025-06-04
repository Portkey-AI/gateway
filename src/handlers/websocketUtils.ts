import { Context } from 'hono';
import { ProviderAPIConfig } from '../providers/types';
import { Options } from '../types/requestBody';
import { RealtimeLlmEventParser } from '../services/realtimeLlmEventParser';

export const addListeners = (
  outgoingWebSocket: WebSocket,
  eventParser: RealtimeLlmEventParser,
  server: WebSocket,
  c: Context,
  sessionOptions: any
) => {
  outgoingWebSocket.addEventListener('message', (event) => {
    server?.send(event.data as string);
    try {
      const parsedData = JSON.parse(event.data as string);
      eventParser.handleEvent(c, parsedData, sessionOptions);
    } catch (err) {
      console.log('outgoingWebSocket message parse error', event);
    }
  });

  outgoingWebSocket.addEventListener('close', (event) => {
    server?.close(event.code, event.reason);
  });

  outgoingWebSocket.addEventListener('error', (event) => {
    console.log('outgoingWebSocket error', event);
    server?.close();
  });

  server.addEventListener('message', (event) => {
    outgoingWebSocket?.send(event.data as string);
  });

  server.addEventListener('close', () => {
    outgoingWebSocket?.close();
  });

  server.addEventListener('error', (event) => {
    console.log('serverWebSocket error', event);
    outgoingWebSocket?.close();
  });
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
  gatewayRequestURL: string,
  c: Context
) => {
  const baseUrl = apiConfig.getBaseURL({
    providerOptions,
    c,
    gatewayRequestURL,
  });
  const endpoint = apiConfig.getEndpoint({
    c,
    providerOptions,
    fn: 'realtime',
    gatewayRequestBodyJSON: {},
    gatewayRequestURL: gatewayRequestURL,
  });
  return `${baseUrl}${endpoint}`;
};
