import { PluginHandler } from '../types';
import {
  getCurrentContentPart,
  HttpError,
  setCurrentContentPart,
} from '../utils';
import { BedrockBody, BedrockParameters } from './type';
import { bedrockPost, redactPii } from './util';

const REQUIRED_CREDENTIAL_KEYS = [
  'awsAccessKeyId',
  'awsSecretAccessKey',
  'awsRegion',
];

export const validateCreds = (
  credentials?: BedrockParameters['credentials']
) => {
  return REQUIRED_CREDENTIAL_KEYS.every((key) =>
    Boolean(credentials?.[key as keyof BedrockParameters['credentials']])
  );
};

export const pluginHandler: PluginHandler<
  BedrockParameters['credentials']
> = async (context, parameters, eventType) => {
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  const credentials = parameters.credentials;

  const validate = validateCreds(credentials);

  const guardrailVersion = parameters.guardrailVersion;
  const guardrailId = parameters.guardrailId;
  const redact = parameters?.redact as boolean;

  let verdict = true;
  let error = null;
  let data = null;
  if (!validate || !guardrailVersion || !guardrailId) {
    return {
      verdict,
      error: { message: 'Missing required credentials' },
      data,
    };
  }

  const body = {} as BedrockBody;

  if (eventType === 'beforeRequestHook') {
    body.source = 'INPUT';
  } else {
    body.source = 'OUTPUT';
  }

  try {
    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
      };
    }

    const results = await Promise.all(
      textArray.map((text) =>
        text
          ? bedrockPost(
              { ...(credentials as any), guardrailId, guardrailVersion },
              {
                content: [{ text: { text } }],
                source: body.source,
              }
            )
          : null
      )
    );

    const interventionData =
      results.find(
        (result) => result && result.action === 'GUARDRAIL_INTERVENED'
      ) ?? results[0];

    const flaggedCategories = new Set();

    results.forEach((result) => {
      if (!result) return;
      if (result.assessments[0].contentPolicy?.filters?.length > 0) {
        flaggedCategories.add('contentFilter');
      }
      if (result.assessments[0].wordPolicy?.customWords?.length > 0) {
        flaggedCategories.add('wordFilter');
      }
      if (result.assessments[0].wordPolicy?.managedWordLists?.length > 0) {
        flaggedCategories.add('wordFilter');
      }
      if (
        result.assessments[0].sensitiveInformationPolicy?.piiEntities?.length >
        0
      ) {
        flaggedCategories.add('piiFilter');
      }
    });

    let hasPii = flaggedCategories.has('piiFilter');
    if (hasPii && redact) {
      const maskedTexts = textArray.map((text, index) =>
        redactPii(text, results[index])
      );

      setCurrentContentPart(context, eventType, transformedData, maskedTexts);
    }

    if (hasPii && flaggedCategories.size === 1 && redact) {
      verdict = true;
    } else if (flaggedCategories.size > 0) {
      verdict = false;
    }
    data = interventionData;
  } catch (e) {
    if (e instanceof HttpError) {
      error = { message: e.response.body };
    } else {
      error = { message: (e as Error).message };
    }
  }
  return {
    verdict,
    error,
    data,
    transformedData,
  };
};
