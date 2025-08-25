import { Agent } from 'https';
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
  pluginOptions?: Record<string, any>
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

  const url = `${credentials?.customHost || `https://${credentials?.resourceName}.cognitiveservices.azure.com`}/language/:analyze-text?api-version=${apiVersion}`;

  const { token, error: tokenError } = await getAccessToken(
    credentials as any,
    'pii',
    pluginOptions,
    pluginOptions?.env
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

  let agent: Agent | null = null;
  // privatelink doesn't contain a valid certificate, skipping verification if it's customHost.
  // SECURITY NOTE: The following disables SSL certificate validation for custom hosts.
  // This is necessary for Azure Private Link endpoints that may use self-signed certificates,
  // but should only be used with trusted private endpoints.
  if (credentials?.customHost) {
    agent = new Agent({
      rejectUnauthorized: false,
    });
  }

  const timeout = parameters.timeout || 5000;
  const requestOptions: Record<string, any> = { headers };
  if (agent) {
    requestOptions.dispatcher = agent;
  }
  const response = await post(url, body, requestOptions, timeout);
  return response;
};

export const handler: PluginHandler<{ pii: AzureCredentials }> = async (
  context: PluginContext,
  parameters: PluginParameters<{ pii: AzureCredentials }>,
  eventType: HookEventType,
  pluginOptions?: Record<string, any>
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
    const response = await redact(documents, parameters, pluginOptions);
    if (!response?.results?.documents) {
      throw new Error('Invalid response from Azure PII API');
    }
    data = response.results.documents;
    const containsPII =
      data.length > 0 && data.some((doc: any) => doc.entities.length > 0);
    if (containsPII) {
      verdict = false;
    }
    if (parameters.redact && containsPII) {
      verdict = true;
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
