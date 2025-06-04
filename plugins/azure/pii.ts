import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getCurrentContentPart, setCurrentContentPart } from '../utils';
import { AzureCredentials } from './types';
import { getAccessToken } from './utils';

const redact = async (
  documents: any[],
  parameters: PluginParameters<{ pii: AzureCredentials }>,
  options?: Record<string, any>
) => {
  const body = {
    kind: 'PiiEntityRecognition',
    parameters: {
      domain: parameters.domain || 'none',
      modelVersion: parameters.modelVersion || 'latest',
      piiCategories: parameters.piiCategories || undefined,
    },
    analysisInput: {
      documents: documents,
    },
  };

  const credentials = parameters.credentials?.pii;

  const apiVersion = parameters.apiVersion || '2024-11-01';

  const url = `https://${credentials?.resourceName}.cognitiveservices.azure.com/language/:analyze-text?api-version=${apiVersion}`;

  const { token, error: tokenError } = await getAccessToken(
    credentials as any,
    'pii',
    options,
    options?.env
  );

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'portkey-ai-plugin/',
    'Ocp-Apim-Subscription-Key': token,
  };

  if (credentials?.azureAuthMode && credentials?.azureAuthMode !== 'apiKey') {
    headers['Authorization'] = `Bearer ${token}`;
    delete headers['Ocp-Apim-Subscription-Key'];
  }

  if (tokenError) {
    throw new Error('Unable to get access token');
  }

  const timeout = parameters.timeout || 5000;
  const response = await post(url, body, { headers }, timeout);
  return response;
};

export const handler: PluginHandler<{ pii: AzureCredentials }> = async (
  context: PluginContext,
  parameters: PluginParameters<{ pii: AzureCredentials }>,
  eventType: HookEventType,
  options?: Record<string, any>
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  const credentials = parameters.credentials?.pii;

  // Validate required credentials
  if (!credentials?.resourceName) {
    return {
      error: new Error('PII credentials must include resourceName'),
      verdict: true,
      data,
    };
  }

  if (!credentials?.apiKey && !credentials?.azureAuthMode) {
    return {
      error: new Error(
        'PII credentials must include either apiKey or azureAuthMode'
      ),
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);

  if (!content) {
    return {
      error: new Error('request or response json is empty'),
      verdict: true,
      data: null,
      transformedData,
      transformed,
    };
  }

  const documents = textArray.map((text, index) => ({
    id: index.toString(),
    text: text,
    language: parameters.language || 'en',
  }));

  try {
    const response = await redact(documents, parameters, options);
    data = response.results.documents;
    if (parameters.redact) {
      const redactedData = (response.results.documents ?? []).map(
        (doc: any) => doc.redactedText
      );
      setCurrentContentPart(context, eventType, transformedData, redactedData);
      transformed = true;
    }
  } catch (e) {
    error = e;
    verdict = true;
    data = null;
  }

  return {
    error,
    verdict,
    data,
    transformedData,
    transformed,
  };
};
