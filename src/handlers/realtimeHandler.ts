import { Context } from 'hono';
import { WSContext, WSEvents } from 'hono/ws';
import { constructConfigFromRequestHeaders } from './handlerUtils';
import { ProviderAPIConfig } from '../providers/types';
import Providers from '../providers';
import { Options } from '../types/requestBody';
import {
  addListeners,
  getOptionsForOutgoingConnection,
  getURLForOutgoingConnection,
} from './websocketUtils';

const getOutgoingWebSocket = async (url: string, options: RequestInit) => {
  let outgoingWebSocket: WebSocket | null = null;
  try {
    let response = await fetch(url, options);
    outgoingWebSocket = response.webSocket;
  } catch (error) {
    console.log(error);
  }

  if (!outgoingWebSocket) {
    throw new Error('WebSocket connection failed');
  }

  outgoingWebSocket.accept();
  return outgoingWebSocket;
};

export async function realTimeHandler(c: Context): Promise<Response> {
  let requestHeaders = Object.fromEntries(c.req.raw.headers);

  const providerOptions = constructConfigFromRequestHeaders(
    requestHeaders
  ) as Options;
  const provider = providerOptions.provider ?? '';
  const apiConfig: ProviderAPIConfig = Providers[provider].api;
  const url = getURLForOutgoingConnection(
    apiConfig,
    providerOptions,
    c.req.url
  );
  const options = await getOptionsForOutgoingConnection(
    apiConfig,
    providerOptions,
    url,
    c
  );

  const webSocketPair = new WebSocketPair();
  const client = webSocketPair[0];
  const server = webSocketPair[1];

  server.accept();

  let outgoingWebSocket: WebSocket = await getOutgoingWebSocket(url, options);

  addListeners(outgoingWebSocket, server, c, url);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
