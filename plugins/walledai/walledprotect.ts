import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, getText, getCurrentContentPart } from '../utils';

const API_URL = 'https://services.walled.ai/v1/walled-protect';

const DEFAULT_PII_LIST = [
  "Person's Name",
  'Address',
  'Email Id',
  'Contact No',
  'Date Of Birth',
  'Unique Id',
  'Financial Data',
];

const DEFAULT_GREETINGS_LIST = ['Casual & Friendly'];

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  if (!parameters.credentials?.apiKey) {
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
  let text = textArray
    .filter((text) => text)
    .join('\n')
    .trim();

  // Prepare request body
  const requestBody = {
    text: text,
    generic_safety_check: parameters.generic_safety_check ?? true,
    greetings_list: parameters.greetings_list || DEFAULT_GREETINGS_LIST,
    pii_list: parameters.pii_list || DEFAULT_PII_LIST,
    compliance_list: parameters.compliance_list || [],
  };
  // Prepare headers
  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': parameters.credentials.apiKey,
    },
  };

  try {
    const response = await post(
      API_URL,
      requestBody,
      requestOptions,
      parameters.timeout
    );
    data = response.data;
    if (data.safety[0]?.isSafe == false) {
      verdict = false;
    }
  } catch (e) {
    console.log(e);
    error = e instanceof Error ? e.message : String(e);
    verdict = true;
    data = null;
  }
  return {
    error,
    verdict,
    data,
  };
};
