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
    let scanPromptObject: any = { prompt: getText(context, eventType) };
    data = await promptSecurityProtectApi(
      parameters.credentials,
      scanPromptObject
    );
    data = data.result.prompt;
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
