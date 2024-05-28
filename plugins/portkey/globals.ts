// import { PluginContext, PluginParameters } from '../types';
// import { getText } from '../utils';

export const PORTKEY_BASE_URL = 'https://api.portkey.ai/v1';
export const PORTKEY_ENDPOINTS = {
  MODERATIONS: '/moderations',
  LANGUAGE: '/tools/detect-language',
  PII: '/tools/detect-pii',
  GIBBERISH: '/tools/detect-gibberish',
};

// export const runCheck = async (
//   context: PluginContext,
//   parameters: PluginParameters,
//   endpoint: string
// ) => {
//   let error = null;
//   let verdict = false;
//   let data = null;

//   try {
//     // Get the text from the request or response
//     let text = getText(context);

//     // Make a fetch request to Portkey API
//     const result = await postCheck(text, parameters, endpoint);

//     // Extract the error, verdict and data from the result using destructuring
//     ({ error, verdict, data } = result);
//   } catch (e) {
//     error = e as Error;
//   }

//   return { error, verdict, data };
// };

// export const postCheck = async (
//   text: string,
//   parameters: PluginParameters,
//   endpoint: string
// ) => {
//   // Sanitize the parameters
//   const credentials = { ...parameters.credentials };
//   delete parameters.credentials;

//   let error = null;
//   let verdict = false;
//   let data = null;

//   try {
//     // Make a fetch request to Portkey API
//     const response = await fetch(`${PORTKEY_BASE_URL}${endpoint}`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'x-portkey-api-key': `${credentials.PORTKEY_API_KEY}`,
//       },
//       body: JSON.stringify({ text, parameters }),
//     });

//     // Parse the response
//     const result: any = await response.json();
//     ({ verdict, data } = result);
//   } catch (e) {
//     error = e as Error;
//   }

//   return { error, verdict, data };
// };

export const fetchPortkey = async (endpoint: string, credentials: any, data:any) => {
  const result = await fetch(`${PORTKEY_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portkey-api-key': `${credentials.PORTKEY_API_KEY}`,
      'x-portkey-provider': "openai",
      'x-portkey-virtual-key': `${credentials.PORTKEY_VIRTUAL_KEY}`
    },
    body: JSON.stringify(data),
  });

  return result.json();
}
