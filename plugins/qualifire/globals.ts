import { post } from '../utils';

// export const BASE_URL = 'https://proxy.qualifire.ai/api/evaluation/evaluate';
export const BASE_URL = 'http://localhost:8080/api/evaluation/evaluate';

export const postQualifire = async (
  body: any,
  qualifireApiKey?: string,
  timeout_millis?: number
) => {
  if (!qualifireApiKey) {
    throw new Error('Qualifire API key is required');
  }

  const options = {
    headers: {
      'X-Qualifire-API-Key': `${qualifireApiKey}`,
    },
  };

  const result = await post(BASE_URL, body, options, timeout_millis || 10000);

  console.log('********************************');
  console.log('result', result);
  console.log('********************************');

  const error = result?.error || null;
  const verdict = result.status === 'success';
  const data = result.evaluationResults;

  return { error, verdict, data };
};
