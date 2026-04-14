import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, setCurrentContentPart } from '../utils';
import { promptSecurityProtectApi } from './shared';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;
  let transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;
  try {
    let scanResponseObject: any = { response: getText(context, eventType) };
    data = await promptSecurityProtectApi(
      parameters.credentials,
      scanResponseObject
    );
    data = data.result.response;
    verdict = data.action !== 'block';
    if (data.modified_text != null) {
        transformed = true;
        setCurrentContentPart(context, eventType, transformedData, [
          data.modified_text,
        ]);
    }
  } catch (e: any) {
    delete e.stack;
    error = e;
  }
  return { error, verdict, data, transformed, transformedData };
};
