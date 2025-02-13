import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, post } from '../utils';

interface MistralResponse {
  id: string;
  model: string;
  results: [
    {
      categories: {
        sexual: boolean;
        hate_and_discrimination: boolean;
        violence_and_threats: boolean;
        dangerous_and_criminal_content: boolean;
        selfharm: boolean;
        health: boolean;
        financial: boolean;
        law: boolean;
        pii: boolean;
      };
      category_score: {
        sexual: number;
        hate_and_discrimination: number;
        violence_and_threats: number;
        dangerous_and_criminal_content: number;
        selfharm: number;
        health: number;
        financial: number;
        law: number;
        pii: number;
      };
    },
  ];
}

type GuardrailFunction = keyof MistralResponse['results'][0]['categories'];

export const mistralGuardrailHandler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  _options
) => {
  let error = null;
  let verdict = true;
  let data = null;

  const creds = parameters.credentials as Record<string, string>;
  if (!creds.apiKey) {
    return {
      error: 'Mistral API key not provided.',
      verdict: false,
      data: null,
    };
  }

  let model = 'mistral-moderation-latest';

  if (parameters.model) {
    // Model can be passed dynamically
    model = parameters.model;
  }

  const checks = parameters.categories as GuardrailFunction[];

  const text = getText(context, eventType);
  const messages =
    eventType === 'beforeRequestHook'
      ? context.request?.json?.messages
      : context.response?.json?.messages;

  // should contain text or should contain messages array
  if (
    (!text && !Array.isArray(messages)) ||
    (Array.isArray(messages) && messages.length === 0)
  ) {
    return {
      error: 'Mistral: Invalid Request body',
      verdict: false,
      data: null,
    };
  }

  // Use conversation guardrail if it's a chatcomplete and before hook
  const shouldUseConversation =
    eventType === 'beforeRequestHook' && context.requestType === 'chatComplete';
  const url = shouldUseConversation
    ? 'https://api.mistral.ai/v1/chat/moderations'
    : 'https://api.mistral.ai/v1/moderations';

  try {
    const request = await post<MistralResponse>(
      url,
      {
        model: model,
        ...(!shouldUseConversation && { input: [text] }),
        ...(shouldUseConversation && { input: [messages] }),
      },
      {
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      parameters.timeout
    );

    const categories: Record<GuardrailFunction, boolean> =
      request.results[0]?.categories ?? {};
    const categoriesFlagged = Object.keys(categories).filter((category) => {
      if (
        checks.includes(category as GuardrailFunction) &&
        !!categories[category as GuardrailFunction]
      ) {
        return true;
      }
      return false;
    });

    if (categoriesFlagged.length > 0) {
      verdict = false;
      data = { flagged_categories: categoriesFlagged };
    }
  } catch (err) {
    error = err;
    verdict = true;
  }

  return { error, verdict, data };
};
