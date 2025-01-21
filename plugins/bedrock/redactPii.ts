import { BedrockBody, BedrockParameters, bedrockPost, validateCreds } from '.';
import { HookEventType, PluginHandler } from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';

const redactPii = async (
  text: string,
  eventType: HookEventType,
  credentials: BedrockParameters
) => {
  const body = {} as BedrockBody;

  if (eventType === 'beforeRequestHook') {
    body.source = 'INPUT';
  } else {
    body.source = 'OUTPUT';
  }

  body.content = [
    {
      text: {
        text,
      },
    },
  ];

  try {
    const response = await bedrockPost(credentials, body);
    let maskedText = text;
    const data = response.output?.[0];

    maskedText = data?.text;
    const isRegexMatch =
      response.assessments[0].sensitiveInformationPolicy?.regexes?.length > 0;
    if (isRegexMatch) {
      response.assessments[0].sensitiveInformationPolicy.regexes.forEach(
        (regex) => {
          maskedText = maskedText.replaceAll(regex.match, `{${regex.name}}`);
        }
      );
    }
    return maskedText;
  } catch (e) {
    return null;
  }
};

export const bedrockPIIHandler: PluginHandler<BedrockParameters> =
  async function (context, parameters, eventType) {
    let transformedData: Record<string, any> = {
      request: {
        json: null,
      },
      response: {
        json: null,
      },
    };

    const credentials = parameters.credentials;

    const validate = validateCreds(credentials);

    if (!validate) {
      return {
        verdict: true,
        error: 'Missing required credentials',
        data: null,
      };
    }

    try {
      const { content, textArray } = getCurrentContentPart(context, eventType);

      if (!content) {
        return {
          error: { message: 'request or response json is empty' },
          verdict: true,
          data: null,
        };
      }

      const transformedTextPromise = textArray.map((text) =>
        redactPii(text, eventType, credentials!)
      );

      const transformedText = await Promise.all(transformedTextPromise);

      setCurrentContentPart(
        context,
        eventType,
        transformedData,
        null,
        transformedText
      );

      return {
        error: null,
        verdict: true,
        data:
          transformedText.filter((text) => text !== null).length > 0
            ? { flagged: true }
            : null,
        transformedData,
      };
    } catch (e: any) {
      delete e.stack;
      return {
        error: e as Error,
        verdict: true,
        data: null,
        transformedData,
      };
    }
  };
