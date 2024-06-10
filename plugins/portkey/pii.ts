import { PluginContext, PluginHandler, PluginParameters } from '../types';
import { getText } from '../utils';
import { PORTKEY_ENDPOINTS, fetchPortkey } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    // Get the text from the request or response
    const text = getText(context);
    const categoriesToCheck = parameters.categories;

    // Check if any of the PII category is found in the text
    const result: any = await fetchPortkey(
      PORTKEY_ENDPOINTS.PII,
      parameters.credentials,
      { text, categoriesToCheck }
    );
    // const result = result.results[0].categories;

    // TODO: complete this function based on the remote function call.

    verdict = true;
  } catch (e) {
    error = e as Error;
  }

  return { error, verdict, data };
};
