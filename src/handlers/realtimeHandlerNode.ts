import { Context } from 'hono';
import { WSContext, WSEvents } from 'hono/ws';
import { constructConfigFromRequestHeaders } from './handlerUtils';
import WebSocket from 'ws';
import { ProviderAPIConfig } from '../providers/types';
import Providers from '../providers';
import { Options } from '../types/requestBody';
import { createRequestOption } from './websocketUtils';

export async function realTimeHandlerNode(
  c: Context
): Promise<WSEvents<unknown>> {
  let incomingWebsocket: WSContext<unknown> | null = null;
  let events: { [key: string]: any }[] = [];
  let requestHeaders = Object.fromEntries(c.req.raw.headers);
  const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

  const provider = camelCaseConfig?.provider ?? '';
  const apiConfig: ProviderAPIConfig = Providers[provider].api;
  const providerOptions = camelCaseConfig as Options;
  const baseUrl = apiConfig.getBaseURL({ providerOptions });
  const endpoint = apiConfig.getEndpoint({
    providerOptions,
    fn: 'realtime',
    gatewayRequestBody: {},
    gatewayRequestURL: c.req.url,
  });
  let url = `${baseUrl}${endpoint}`;
  url = url.replace('https://', 'wss://');
  const headers = await apiConfig.headers({
    c,
    providerOptions,
    fn: 'realtime',
    transformedRequestUrl: url,
    transformedRequestBody: {},
  });

  const outgoingWebSocket = new WebSocket(url, {
    headers,
  });

  outgoingWebSocket.addEventListener('message', (event) => {
    incomingWebsocket?.send(event.data as string);
    const parsedData = JSON.parse(event.data as string);
    parsedData.createdAt = new Date();
    events.push(parsedData);
  });

  outgoingWebSocket.addEventListener('close', (event) => {
    incomingWebsocket?.close();
  });

  outgoingWebSocket.addEventListener('error', (event) => {
    console.log('outgoingWebSocket error', event);
    incomingWebsocket?.close();
  });

  return {
    onOpen(evt, ws) {
      incomingWebsocket = ws;
    },
    onMessage(event, ws) {
      outgoingWebSocket?.send(event.data as string);
      try {
        const parsedData = JSON.parse(event.data as string);
        parsedData.createdAt = new Date();
        events.push(parsedData);
      } catch (error) {
        console.log('error parsing event', error);
      }
    },
    onError(evt, ws) {
      console.log('realtimeHandler error', evt);
      outgoingWebSocket?.close();
    },
    onClose(evt, ws) {
      outgoingWebSocket?.close();
      c.set('requestOptions', createRequestOption(url, events));
    },
  };
}
