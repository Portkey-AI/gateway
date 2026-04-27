import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getText,
  getCurrentContentPart,
  setCurrentContentPart,
} from '../utils';
import { promptSecurityProtectApi, buildProtectPayload } from './shared';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  try {
    const text = getText(context, eventType) || context.request?.text || '';
    const payload = buildProtectPayload(text, 'prompt', context, parameters);
    let response = await promptSecurityProtectApi(
      parameters.credentials,
      payload
    );
    data = response.result?.prompt ?? null;
    verdict = data?.passed ?? false;

    if (data?.modified_text && parameters.redact) {
      const { textArray } = getCurrentContentPart(context, eventType);
      const modifiedTextArray = textArray.map(() => data.modified_text);
      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        modifiedTextArray
      );
      transformed = true;
    }
  } catch (e: any) {
    delete e.stack;
    error = e;
  }
  return { error, verdict, data, transformedData, transformed };
};
