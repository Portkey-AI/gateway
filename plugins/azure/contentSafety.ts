import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText } from '../utils';
import { AzureCredentials } from './types';
import { getAccessToken } from './utils';

const defaultCategories = ['Hate', 'SelfHarm', 'Sexual', 'Violence'];

export const handler: PluginHandler<{
  contentSafety: AzureCredentials;
}> = async (
  context: PluginContext,
  parameters: PluginParameters<{ contentSafety: AzureCredentials }>,
  eventType: HookEventType,
  options
) => {
  let error = null;
  let verdict = true;
  let data = null;

  const credentials = parameters.credentials?.contentSafety;

  if (!credentials) {
    return {
      error: new Error('parameters.credentials.contentSafety must be set'),
      verdict: true,
      data,
    };
  }

  // Validate required credentials
  if (!credentials?.resourceName) {
    return {
      error: new Error('Content Safety credentials must include resourceName'),
      verdict: true,
      data,
    };
  }

  // prefer api key over auth mode
  if (!credentials?.azureAuthMode && !credentials?.apiKey) {
    return {
      error: new Error(
        'Content Safety credentials must include either apiKey or azureAuthMode'
      ),
      verdict: true,
      data,
    };
  }

  const text = getText(context, eventType);
  if (!text) {
    return {
      error: new Error('request or response text is empty'),
      verdict: true,
      data,
    };
  }

  const apiVersion = parameters.apiVersion || '2024-11-01';

  const url = `https://${credentials.resourceName}.cognitiveservices.azure.com/contentsafety/text:analyze?api-version=${apiVersion}`;

  const { token, error: tokenError } = await getAccessToken(
    credentials as any,
    'contentSafety',
    options,
    options?.env
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

  const request = {
    text: text,
    categories: parameters.categories || defaultCategories,
    blocklistNames: parameters.blocklistNames || [],
  };

  const timeout = parameters.timeout || 5000;
  let response;
  try {
    response = await post(url, request, { headers }, timeout);
  } catch (e) {
    return { error: e, verdict: true, data };
  }

  if (response) {
    data = response;

    // Check if any category exceeds the threshold (default: 2 - Medium)
    const hasHarmfulContent = response.categoriesAnalysis?.some(
      (category: any) => {
        return category.severity >= (parameters.severity || 2);
      }
    );

    // Check if any blocklist items were hit
    const hasBlocklistHit = response.blocklistsMatch?.length > 0;

    verdict = !(hasHarmfulContent || hasBlocklistHit);
  }

  return {
    error,
    verdict,
    data,
  };
};
