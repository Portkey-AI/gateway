import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { PORTKEY_ENDPOINTS, fetchPortkey } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const text = getText(context, eventType);
    const categories = parameters.categories;
    const not = parameters.not || false;

    const result: any = await fetchPortkey(
      options?.env || {},
      PORTKEY_ENDPOINTS.MODERATIONS,
      parameters.credentials,
      { input: text },
      parameters.timeout
    );

    const categoriesFlagged = Object.keys(result.results[0].categories).filter(
      (category) => result.results[0].categories[category]
    );

    const intersection = categoriesFlagged.filter((category) =>
      categories.includes(category)
    );

    const hasRestrictedContent = intersection.length > 0;
    verdict = not ? hasRestrictedContent : !hasRestrictedContent;

    data = {
      verdict,
      not,
      explanation: verdict
        ? not
          ? 'Found restricted content categories as expected.'
          : 'No restricted content categories were found.'
        : not
          ? 'No restricted content categories were found when they should have been.'
          : `Found restricted content categories: ${intersection.join(', ')}`,
      flaggedCategories: intersection,
      restrictedCategories: categories,
      allFlaggedCategories: categoriesFlagged,
      moderationResults: result.results[0],
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text,
    };
  } catch (e) {
    error = e as Error;
    const text = getText(context, eventType);
    data = {
      explanation: `An error occurred during content moderation: ${error.message}`,
      not: parameters.not || false,
      restrictedCategories: parameters.categories || [],
      textExcerpt: text
        ? text.length > 100
          ? text.slice(0, 100) + '...'
          : text
        : 'No text available',
    };
  }

  return { error, verdict, data };
};
