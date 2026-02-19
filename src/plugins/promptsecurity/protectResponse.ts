import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { promptSecurityProtectApi } from './shared';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;
  try {
    let scanResponseObject: any = { response: getText(context, eventType) };
    data = await promptSecurityProtectApi(
      parameters.credentials,
      scanResponseObject
    );
    data = data.result.response;
    verdict = data.passed;
  } catch (e: any) {
    delete e.stack;
    error = e;
  }
  return { error, verdict, data };
};
