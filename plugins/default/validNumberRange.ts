import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function validNumberRange(
  target: Number,
  lowerLimit: Number,
  upperLimit: Number
): boolean {
  try {
    return target >= lowerLimit && target <= upperLimit;
  } catch (error) {
    return false;
  }
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    let target = parameters.target;
    let lowerLimit = parameters.lowerLimit;
    let upperLimit = parameters.upperLimit;
    verdict = validNumberRange(target, lowerLimit, upperLimit);
  } catch (e) {
    error = e as Error;
    verdict = false;
  }

  return { error, verdict, data };
};

export { validNumberRange };
