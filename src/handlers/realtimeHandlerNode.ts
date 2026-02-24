import { Context } from 'hono';
import { constructConfigFromRequestHeaders } from '../utils/request';
import WebSocket from 'ws';
import { ProviderAPIConfig } from '../providers/types';
import Providers from '../providers';
import { Options } from '../types/requestBody';
import { RealTimeLLMEventParser } from '../services/realtimeLLMEventParser';
import { logger } from '../apm';
import { WSContext, WSEvents } from 'hono/ws';
import { getExternalNodeFetchAgentForUrl } from '../agentStore';

export async function realTimeHandlerNode(
  c: Context
): Promise<WSEvents<unknown>> {
  try {
    let incomingWebsocket: WSContext<unknown> | null = null;
    const requestHeaders = c.get('mappedHeaders');
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const provider = camelCaseConfig?.provider ?? '';
    const apiConfig: ProviderAPIConfig = Providers[provider].api;
    const providerOptions = camelCaseConfig as Options;
    const urlObject = new URL(c.req.url);
    const model = urlObject.searchParams.get('model');
    if (model && model.startsWith('@')) {
      urlObject.searchParams.set('model', model.replace(/@[^/]+\//, ''));
    }
    const incomingUrl = urlObject.toString();

    const baseUrl = apiConfig.getBaseURL({
      providerOptions,
      c,
      gatewayRequestURL: incomingUrl,
    });
    const endpoint = apiConfig.getEndpoint({
      c,
      providerOptions,
      fn: 'realtime',
      gatewayRequestBodyJSON: {},
      gatewayRequestURL: incomingUrl,
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

    // Get agent for WebSocket connection (handles proxy/timeout/TLS automatically)
    const agent = getExternalNodeFetchAgentForUrl(url);

    const outgoingWebSocket = new WebSocket(url, {
      headers,
      ...(agent ? { agent } : {}),
    });
    const eventParser = new RealTimeLLMEventParser();

    outgoingWebSocket.addEventListener('message', (event) => {
      incomingWebsocket?.send(event.data as string);
      try {
        const parsedData = JSON.parse(event.data as string);
        eventParser.handleEvent(c, parsedData, sessionOptions);
      } catch (err: any) {
        logger.error(`eventParser.handleEvent error:`, err);
      }
    });

    outgoingWebSocket.addEventListener('close', (event) => {
      incomingWebsocket?.close(event.code, event.reason);
    });

    outgoingWebSocket.addEventListener('error', (event) => {
      logger.error(`outgoingWebSocket error:`, event);
      incomingWebsocket?.close();
    });

    // wait for the upstream websocket to be open
    const checkWebSocketOpen = new Promise((resolve) => {
      outgoingWebSocket.addEventListener('open', () => {
        resolve(true);
      });
    });

    await checkWebSocketOpen;

    return {
      onOpen(evt, ws) {
        incomingWebsocket = ws;
      },
      onMessage(event) {
        outgoingWebSocket?.send(event.data as string);
      },
      onError(evt) {
        logger.error(`incomingWebsocket error:`, evt);
        outgoingWebSocket?.close();
      },
      onClose() {
        outgoingWebSocket?.close();
      },
    };
  } catch (err) {
    console.log('err-catch', err);
    c.set('websocketError', true);
    return {
      onOpen() {},
      onMessage() {},
      onError() {},
      onClose() {},
    };
  }
}
