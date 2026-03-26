import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';
import { createConversation, checkUserInput } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = false;
  let data: any = null;

  try {
    const apiKey: string = parameters?.credentials?.apiKey;
    const firewallId: string = parameters?.firewallId;

    if (!apiKey) throw new Error('Missing credentials.apiKey parameter');
    if (!firewallId) throw new Error('Missing firewallId parameter');

    // Extract text from request or response depending on hook type
    const content = getText(context, eventType);
    if (!content) {
      return { error: null, verdict: true, data: { skipped: true, reason: 'empty content' } };
    }

    // Step 1 — create a fresh conversation
    const conversationId = await createConversation(firewallId, apiKey);

    // Step 2 — check the content
    const result = await checkUserInput(firewallId, conversationId, content, apiKey);

    verdict = !result.violate_policy;   // true = pass, false = block
    data = {
      violate_policy: result.violate_policy,
      message_id: result.message_id,
      conversation_id: conversationId,
      firewall_id: firewallId,
      checked_text: content.slice(0, 200),
    };

  } catch (e: any) {
    delete e.stack;
    error = e;
    verdict = true;   // fail open — don't block on error
    data = { error: e.message };
  }

  return { error, verdict, data };
};