import { Context } from 'hono';
import { constructConfigFromRequestHeaders } from './handlerUtils';
import WebSocket from 'ws';
import { ProviderAPIConfig } from '../providers/types';
import Providers from '../providers';
import { Options } from '../types/requestBody';
import { RealtimeLlmEventParser } from '../services/realtimeLlmEventParser';
import { WSContext, WSEvents } from 'hono/ws';

export async function realTimeHandlerNode(
  c: Context
): Promise<WSEvents<unknown>> {
  try {
    let incomingWebsocket: WSContext<unknown> | null = null;
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const provider = camelCaseConfig?.provider ?? '';
    const apiConfig: ProviderAPIConfig = Providers[provider].api;
    const providerOptions = camelCaseConfig as Options;
    const baseUrl = apiConfig.getBaseURL({
      providerOptions,
      c,
      gatewayRequestURL: c.req.url,
    });
    const endpoint = apiConfig.getEndpoint({
      c,
      providerOptions,
      fn: 'realtime',
      gatewayRequestBodyJSON: {},
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

    const sessionOptions = {
      id: crypto.randomUUID(),
      providerOptions: {
        ...providerOptions,
        requestURL: url,
        rubeusURL: 'realtime',
      },
      requestHeaders,
      requestParams: {},
    };

    const outgoingWebSocket = new WebSocket(url, {
      headers,
    });
    const eventParser = new RealtimeLlmEventParser();

    outgoingWebSocket.addEventListener('message', (event) => {
      incomingWebsocket?.send(event.data as string);
      try {
        const parsedData = JSON.parse(event.data as string);
        eventParser.handleEvent(c, parsedData, sessionOptions);
      } catch (err: any) {
        console.error(`eventParser.handleEvent error: ${err.message}`);
      }
    });

    outgoingWebSocket.addEventListener('close', (event) => {
      incomingWebsocket?.close(event.code, event.reason);
    });

    outgoingWebSocket.addEventListener('error', (event) => {
      console.error(`outgoingWebSocket error: ${event.message}`);
      incomingWebsocket?.close();
    });

    return {
      onOpen(evt, ws) {
        incomingWebsocket = ws;
      },
      onMessage(event) {
        outgoingWebSocket?.send(event.data as string);
      },
      onError(evt) {
        console.error(`incomingWebsocket error: ${evt.type}`);
        outgoingWebSocket?.close();
      },
      onClose() {
        outgoingWebSocket?.close();
      },
    };
  } catch (err) {
    c.set('websocketError', true);
    return {
      onOpen() {},
      onMessage() {},
      onError() {},
      onClose() {},
    };
  }
}
