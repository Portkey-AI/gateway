import { post } from '../utils';

export const DEEPKEEP_BASE_URL = 'https://api.prod.deepkeep.ai/api/v2';

export async function createConversation(
  firewallId: string,
  apiKey: string
): Promise<string> {
  const resp = await post<{ conversation_id: string }>(
    `${DEEPKEEP_BASE_URL}/firewalls/${firewallId}/conversation`,
    { title: 'portkey-guardrail' },
    { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' } },
    8000
  );
  if (!resp.conversation_id) throw new Error('No conversation_id returned');
  return resp.conversation_id;
}

export async function checkUserInput(
  firewallId: string,
  conversationId: string,
  content: string,
  apiKey: string
): Promise<{ violate_policy: boolean; content: string; message_id: string }> {
  return post(
    `${DEEPKEEP_BASE_URL}/firewalls/${firewallId}/conversation/${conversationId}/check_user_input`,
    { content, logs: false },
    { headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' } },
    8000
  );
}