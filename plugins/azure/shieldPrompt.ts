import { HookEventType, PluginContext, PluginParameters } from '../types';
import { post, getText, getCurrentContentPart } from '../utils';
import { AzureCredentials } from './types';
import { getAccessToken } from './utils';

/**
 * Shield Prompt handler for detecting jailbreak and prompt injection attacks.
 * Uses Azure AI Content Safety Prompt Shields API.
 *
 * @see https://learn.microsoft.com/en-us/azure/ai-services/content-safety/quickstart-jailbreak
 */
export const handler = async (
  context: PluginContext,
  parameters: PluginParameters<{ contentSafety: AzureCredentials }>,
  eventType: HookEventType
) => {
  let verdict = true;
  let data = null;

  if (eventType === 'afterRequestHook') {
    return {
      error: new Error('Shield Prompt is not supported for afterRequestHook'),
      verdict: true,
      data,
    };
  }

  const credentials = parameters.credentials?.contentSafety;

  if (!credentials) {
    return {
      error: new Error('parameters.credentials must be set'),
      verdict: true,
      data,
    };
  }

  // Validate required credentials
  if (!credentials?.resourceName) {
    return {
      error: new Error('Shield Prompt credentials must include resourceName'),
      verdict: true,
      data,
    };
  }

  // prefer api key over auth mode
  if (!credentials?.azureAuthMode && !credentials?.apiKey) {
    return {
      error: new Error(
        'Shield Prompt credentials must include either apiKey or azureAuthMode'
      ),
      verdict: true,
      data,
    };
  }

  const requests = context.request?.json?.messages;
  const systemMessages = requests?.filter(
    (message: any) => message.role === 'system'
  );

  let userPrompt;

  // If system message, flatten them into a single string, if not, use the user prompt
  if (Array.isArray(systemMessages) && systemMessages.length > 0) {
    userPrompt = systemMessages
      .map((message: any) =>
        Array.isArray(message.content)
          ? message.content.map((item: any) => item.text).join('\n')
          : message.content
      )
      .join('\n');
  } else {
    userPrompt = getText(context, eventType) || '';
  }

  const { textArray } = getCurrentContentPart(context, eventType);

  const request = {
    userPrompt,
    ...(systemMessages.length > 0 ? { documents: textArray } : {}), // If system message, add user prompt as documents
  };

  const apiVersion = parameters.apiVersion || '2024-09-01';

  const url = `https://${credentials.resourceName}.cognitiveservices.azure.com/contentsafety/text:shieldPrompt?api-version=${apiVersion}`;

  const { token, error: tokenError } = await getAccessToken(
    credentials as any,
    'shieldPrompt'
  );

  if (tokenError) {
    return {
      error: tokenError,
      verdict: true,
      data,
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'portkey-ai-plugin/',
    'Ocp-Apim-Subscription-Key': token,
  };

  if (credentials?.azureAuthMode && credentials?.azureAuthMode !== 'apiKey') {
    headers['Authorization'] = `Bearer ${token}`;
    delete headers['Ocp-Apim-Subscription-Key'];
  }

  const timeout = parameters.timeout || 5000;
  let response;
  try {
    response = await post(url, request, { headers }, timeout);
  } catch (e) {
    return { error: e, verdict: true, data };
  }

  if (response) {
    data = response;

    // Check if user prompt attack was detected
    const userPromptAttackDetected =
      response.userPromptAnalysis?.attackDetected === true;

    // Check if any document attack was detected
    const documentAttackDetected = response.documentsAnalysis?.some(
      (doc: { attackDetected: boolean }) => doc.attackDetected === true
    );

    // Verdict is false if any attack is detected
    verdict = !(userPromptAttackDetected || documentAttackDetected);
  }

  return {
    error: null,
    verdict,
    data,
  };
};
