import { Context } from 'hono';
import { ProviderAPIConfig } from '../providers/types';
import Providers from '../providers';
import { Options } from '../types/requestBody';
import {
  addListeners,
  getOptionsForOutgoingConnection,
  getURLForOutgoingConnection,
} from './websocketUtils';
import { constructConfigFromRequestHeaders } from '../utils/request';
import { RealTimeLLMEventParser } from '../services/realtimeLLMEventParser';

const getOutgoingWebSocket = async (url: string, options: RequestInit) => {
  let outgoingWebSocket: WebSocket | null = null;
  try {
    let response = await fetch(url, options);
    outgoingWebSocket = response.webSocket;
  } catch (error) {
    console.error('getOutgoingWebSocket error: ', error);
  }

  if (!outgoingWebSocket) {
    throw new Error('WebSocket connection failed');
  }

  outgoingWebSocket.accept();
  return outgoingWebSocket;
};

export async function realTimeHandler(c: Context): Promise<Response> {
  try {
    const requestHeaders = c.get('mappedHeaders');

    const providerOptions = constructConfigFromRequestHeaders(
      requestHeaders
    ) as Options;
    const urlObject = new URL(c.req.url);
    const model = urlObject.searchParams.get('model');
    if (model && model.startsWith('@')) {
      urlObject.searchParams.set('model', model.replace(/@[^/]+\//, ''));
    }
    const incomingUrl = urlObject.toString();
    const provider = providerOptions.provider ?? '';
    const apiConfig: ProviderAPIConfig = Providers[provider].api;
    const url = getURLForOutgoingConnection(
      apiConfig,
      providerOptions,
      incomingUrl,
      c
    );
    const options = await getOptionsForOutgoingConnection(
      apiConfig,
      providerOptions,
      url,
      c
    );

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

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    server.accept();

    let outgoingWebSocket: WebSocket = await getOutgoingWebSocket(url, options);
    const eventParser = new RealTimeLLMEventParser();
    addListeners(outgoingWebSocket, eventParser, server, c, sessionOptions);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  } catch (err: any) {
    console.error('realtimeHandler error: ', err.message);
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'Something went wrong',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
