import { PluginHandler } from '../types';
import {
  getCurrentContentPart,
  HttpError,
  setCurrentContentPart,
} from '../utils';
import { BedrockAccessKeyCreds, BedrockBody, BedrockParameters } from './type';
import { bedrockPost, getAssumedRoleCredentials, redactPii } from './util';

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

export const handleCredentials = async (
  options: Record<string, any>,
  credentials: BedrockParameters['credentials'] | null
) => {
  const finalCredentials = {} as BedrockAccessKeyCreds;
  if (credentials?.awsAuthType === 'assumedRole') {
    try {
      // Assume the role in the source account
      const sourceRoleCredentials = await getAssumedRoleCredentials(
        options.getFromCacheByKey,
        options.putInCacheWithValue,
        options.env,
        options.env.AWS_ASSUME_ROLE_SOURCE_ARN, // Role ARN in the source account
        options.env.AWS_ASSUME_ROLE_SOURCE_EXTERNAL_ID || '', // External ID for source role (if needed)
        credentials.awsRegion || ''
      );

      if (!sourceRoleCredentials) {
        throw new Error('Failed to assume internal role');
      }

      // Assume role in destination account using temporary creds obtained in first step
      const destinationCredentials =
        (await getAssumedRoleCredentials(
          options.getFromCacheByKey,
          options.putInCacheWithValue,
          options.env,
          credentials.awsRoleArn || '',
          credentials.awsExternalId || '',
          credentials.awsRegion || '',
          {
            accessKeyId: sourceRoleCredentials.accessKeyId,
            secretAccessKey: sourceRoleCredentials.secretAccessKey,
            sessionToken: sourceRoleCredentials.sessionToken,
          }
        )) || {};
      if (!destinationCredentials) {
        throw new Error('Failed to assume destination role');
      }
      finalCredentials.awsAccessKeyId = destinationCredentials.accessKeyId;
      finalCredentials.awsSecretAccessKey =
        destinationCredentials.secretAccessKey;
      finalCredentials.awsSessionToken = destinationCredentials.sessionToken;
      finalCredentials.awsRegion = credentials.awsRegion || '';
    } catch {
      throw new Error('Error while assuming role');
    }
  } else {
    finalCredentials.awsAccessKeyId = credentials?.awsAccessKeyId || '';
    finalCredentials.awsSecretAccessKey = credentials?.awsSecretAccessKey || '';
    finalCredentials.awsSessionToken = credentials?.awsSessionToken || '';
    finalCredentials.awsRegion = credentials?.awsRegion || '';
  }
  return finalCredentials;
};

export const pluginHandler: PluginHandler<
  BedrockParameters['credentials']
> = async (context, parameters, eventType, options) => {
  const transformedData: Record<string, any> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let verdict = true;
  let error = null;
  let data = null;
  let transformed = false;

  const body = {} as BedrockBody;
  if (eventType === 'beforeRequestHook') {
    body.source = 'INPUT';
  } else {
    body.source = 'OUTPUT';
  }

  try {
    const credentials = parameters.credentials || null;
    const finalCredentials = await handleCredentials(
      options as Record<string, any>,
      credentials
    );
    const validate = validateCreds(finalCredentials);

    const guardrailVersion = parameters.guardrailVersion;
    const guardrailId = parameters.guardrailId;
    const redact = parameters?.redact as boolean;

    if (!validate || !guardrailVersion || !guardrailId) {
      return {
        verdict,
        error: { message: 'Missing required credentials' },
        data,
        transformed,
        transformedData,
      };
    }

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request or response json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const results = await Promise.all(
      textArray.map((text) =>
        text
          ? bedrockPost(
              { ...(finalCredentials as any), guardrailId, guardrailVersion },
              {
                content: [{ text: { text } }],
                source: body.source,
              },
              parameters.timeout
            )
          : null
      )
    );

    const interventionData = results.find(
      (result) => result && result.action === 'GUARDRAIL_INTERVENED'
    );
    if (interventionData) {
      verdict = false;
    }

    const flaggedCategories = new Set();

    let hasTriggeredPII = false;
    for (const result of results) {
      if (!result) continue;
      // adding other guardrail categories to the set, required for PII redaction check.
      if (result.assessments[0]?.contentPolicy) {
        flaggedCategories.add('contentFilter');
      }
      if (result.assessments[0]?.wordPolicy) {
        flaggedCategories.add('wordFilter');
      }

      if (hasTriggeredPII) {
        continue;
      }

      const sensitiveInfo = result.assessments[0]?.sensitiveInformationPolicy;
      const sensitiveInfoKeys = Object.keys(sensitiveInfo ?? {});
      sensitiveInfoKeys.forEach((key: string) => {
        if ((sensitiveInfo as any)[key].length > 0) {
          flaggedCategories.add('piiFilter');
          hasTriggeredPII = true;
        }
      });
    }

    if (hasTriggeredPII && redact) {
      const maskedTexts = textArray.map((text, index) =>
        redactPii(text, results[index])
      );

      setCurrentContentPart(context, eventType, transformedData, maskedTexts);
      transformed = true;
    }

    if (hasTriggeredPII && flaggedCategories.size === 1 && redact) {
      verdict = true;
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
    transformed,
  };
};
