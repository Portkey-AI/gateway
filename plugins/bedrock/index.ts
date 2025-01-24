import { HookEventType, PluginContext, PluginHandler } from '../types';
import {
  getCurrentContentPart,
  getText,
  HttpError,
  setCurrentContentPart,
} from '../utils';
import { BedrockBody, BedrockParameters } from './type';
import { bedrockPost, redactPii } from './util';

const REQUIRED_CREDENTIAL_KEYS = ['accessKeyId', 'accessKeySecret', 'region'];

export const validateCreds = (
  credentials?: BedrockParameters['credentials']
) => {
  return REQUIRED_CREDENTIAL_KEYS.every((key) =>
    Boolean(credentials?.[key as keyof BedrockParameters['credentials']])
  );
};

const transformedData = {
  request: {
    json: null,
  },
  response: {
    json: null,
  },
};

const handleRedaction = async (
  context: PluginContext,
  hookType: HookEventType,
  credentials: Record<string, string>
) => {
  const { content, textArray } = getCurrentContentPart(context, hookType);

  if (!content) {
    return [];
  }
  const redactPromises = textArray.map(async (text) => {
    const result = await redactPii(text, hookType, credentials);

    if (result) {
      setCurrentContentPart(context, hookType, transformedData, result);
    }
  });

  await Promise.all(redactPromises);
};

export const pluginHandler: PluginHandler<
  BedrockParameters['credentials']
> = async (context, parameters, eventType) => {
  const credentials = parameters.credentials;

  const validate = validateCreds(credentials);

  const guardrailVersion = parameters.guardrailVersion;
  const guardrailId = parameters.guardrailId;
  const pii = parameters?.piiCheck as boolean;

  let verdict = true;
  let error = null;
  let data = null;
  if (!validate || !guardrailVersion || !guardrailId) {
    return {
      verdict,
      error: 'Missing required credentials',
      data,
    };
  }

  if (pii) {
    await handleRedaction(context, eventType, {
      ...credentials,
      guardrailId,
      guardrailVersion,
    });

    return { error, data, verdict: true, transformedData };
  }

  const body = {} as BedrockBody;

  if (eventType === 'beforeRequestHook') {
    body.source = 'INPUT';
  } else {
    body.source = 'OUTPUT';
  }

  body.content = [
    {
      text: {
        text: getText(context, eventType),
      },
    },
  ];

  try {
    const response = await bedrockPost(
      { ...(credentials as any), guardrailId, guardrailVersion },
      body
    );
    if (response.action === 'GUARDRAIL_INTERVENED') {
      verdict = false;
      // Send assessments
      data = response.assessments[0] as any;

      delete data['invocationMetrics'];
      delete data['usage'];
    }
  } catch (e) {
    if (e instanceof HttpError) {
      error = e.response.body;
    } else {
      error = (e as Error).message;
    }
  }
  return {
    verdict,
    error,
    data,
  };
};
