import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

function isAllUpperCase(str: string): boolean {
  // Remove non-letter characters and check if any lowercase letters exist
  return str.replace(/[^a-zA-Z]/g, '') === str.replace(/[^a-zA-Z]/g, '').toUpperCase();
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    let text = getText(context, eventType);
    
    if (!text) {
      throw new Error('Missing text to analyze');
    }

    verdict = isAllUpperCase(text);
    const lettersOnly = text.replace(/[^a-zA-Z]/g, '');

    data = {
      verdict,
      explanation: verdict
        ? 'All alphabetic characters in the text are uppercase.'
        : 'The text contains lowercase characters.',
      textExcerpt: text.length > 100 ? text.slice(0, 100) + '...' : text
    };
  } catch (e: any) {
    error = e;
    let textExcerpt = getText(context, eventType);
    textExcerpt = textExcerpt?.length > 100 
      ? textExcerpt.slice(0, 100) + '...' 
      : textExcerpt;
    
    data = {
      explanation: `An error occurred while checking uppercase: ${e.message}`,
      textExcerpt: textExcerpt || 'No text available',
    };
  }

  return { error, verdict, data };
};
