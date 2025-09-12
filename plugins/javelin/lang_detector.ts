import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';

interface JavelinCredentials {
  apiKey: string;
  domain?: string;
  application?: string;
}

interface LanguageDetectorResponse {
  assessments: Array<{
    lang_detector: {
      results?: {
        lang: string;
        prob: number;
      };
      request_reject?: boolean;
    };
  }>;
}

async function callJavelinLanguageDetector(
  text: string,
  credentials: JavelinCredentials
): Promise<LanguageDetectorResponse> {
  const domain = credentials.domain || 'api-dev.javelin.live';
  const apiUrl = `https://${domain}/v1/guardrail/lang_detector/apply`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-javelin-apikey': credentials.apiKey,
  };

  if (credentials.application) {
    headers['x-javelin-application'] = credentials.application;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { text },
      config: {},
      metadata: {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Javelin Language Detector API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  const credentials = parameters.credentials as unknown as JavelinCredentials;
  if (!credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
    };
  }

  const text = textArray.filter((text) => text).join('\n');

  try {
    const response = await callJavelinLanguageDetector(text, credentials);
    const assessment = response.assessments[0];
    const langDetectorData = assessment.lang_detector;

    if (!langDetectorData) {
      return {
        error: {
          message: 'Invalid response from Javelin Language Detector API',
        },
        verdict: true,
        data: null,
      };
    }

    const results = langDetectorData.results;
    if (!results) {
      verdict = true;
      data = { error: 'No language detection results' };
    } else {
      const detectedLang = results.lang;
      const confidence = results.prob || 0;
      const allowedLanguages = parameters.allowed_languages || [];
      const minConfidence = parameters.min_confidence || 0.8;

      // Check if language is allowed (if specified)
      if (
        allowedLanguages.length > 0 &&
        !allowedLanguages.includes(detectedLang)
      ) {
        verdict = false;
        data = {
          detected_language: detectedLang,
          confidence,
          allowed_languages: allowedLanguages,
          message: `Language '${detectedLang}' not in allowed list`,
          request_reject: langDetectorData.request_reject || false,
        };
      } else if (confidence < minConfidence) {
        verdict = false;
        data = {
          detected_language: detectedLang,
          confidence,
          min_confidence: minConfidence,
          message: `Confidence ${confidence} below minimum threshold`,
          request_reject: langDetectorData.request_reject || false,
        };
      } else {
        verdict = true;
        data = {
          detected_language: detectedLang,
          confidence,
          request_reject: langDetectorData.request_reject || false,
        };
      }
    }
  } catch (e: any) {
    error = e;
  }

  return { error, verdict, data };
};
