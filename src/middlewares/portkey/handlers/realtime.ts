import { Context } from 'hono';
import { env } from 'hono/adapter';
import { forwardToWinky } from './logger';
import { getDebugLogSetting, getPortkeyHeaders } from '../utils';
import { MODES, PORTKEY_HEADER_KEYS } from '../globals';
import { getContext, ContextKeys } from '../contextHelpers';
import { OrganisationDetails, WinkyLogObject } from '../types';
import { logger } from '../../../apm';

export async function realtimeEventLogHandler(
  c: Context,
  sessionOptions: Record<string, any>,
  req: Record<string, any>,
  res: Record<string, any>,
  eventType: string
): Promise<boolean> {
  try {
    const logId = crypto.randomUUID();
    let metadata: Record<string, string> = {};
    try {
      metadata = JSON.parse(
        sessionOptions.requestHeaders['x-portkey-metadata']
      );
    } catch (err) {
      metadata = {};
    }

    metadata._realtime_event_type = eventType;
    metadata._category = MODES.REALTIME;
    const headersObj = {
      ...c.get('headersObj'),
      'x-portkey-span-name': eventType,
      'x-portkey-metadata': JSON.stringify(metadata),
    };
    const portkeyHeaders = getPortkeyHeaders(headersObj);
    const headersWithoutPortkeyHeaders = Object.assign({}, headersObj); //deep copy
    Object.values(PORTKEY_HEADER_KEYS).forEach((eachPortkeyHeader) => {
      delete headersWithoutPortkeyHeaders[eachPortkeyHeader];
    });
    const orgDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS)!;
    const winkyLogObject: WinkyLogObject = {
      id: logId,
      traceId: portkeyHeaders['x-portkey-trace-id'],
      createdAt: new Date(),
      internalTraceId: sessionOptions.id,
      requestMethod: 'POST',
      requestURL: sessionOptions.providerOptions.requestURL,
      rubeusURL: sessionOptions.providerOptions.rubeusURL,
      requestHeaders: headersWithoutPortkeyHeaders,
      requestBody: req,
      requestBodyParams: req,
      responseStatus: eventType === 'error' ? 500 : 200,
      responseTime: 0,
      responseBody: res,
      responseHeaders: {},
      providerOptions: sessionOptions.providerOptions,
      debugLogSetting: getDebugLogSetting(portkeyHeaders, orgDetails),
      cacheKey: '',
      config: {
        organisationConfig: {},
        organisationDetails: orgDetails as OrganisationDetails,
        cacheType: 'DISABLED',
        retryCount: 0,
        portkeyHeaders: portkeyHeaders,
        proxyMode: MODES.REALTIME,
        streamingMode: true,
        cacheStatus: 'DISABLED',
        provider: sessionOptions.providerOptions.provider,
        internalTraceId: sessionOptions.id,
        cacheMaxAge: null,
        requestParams: req,
        lastUsedOptionIndex: 0,
      },
      gatewayVersion: '',
      requestParsingTime: 0,
      preProcessingTime: 0,
      cacheExecutionTime: 0,
      responseParsingTime: 0,
      timeToLastToken: 0,
      gatewayProcessingTime: 0,
    };
    forwardToWinky(env(c), winkyLogObject);
    return true;
  } catch (err: any) {
    logger.error({
      message: `realtimeEventLogHandler error: ${err.message}`,
    });
    return false;
  }
}
