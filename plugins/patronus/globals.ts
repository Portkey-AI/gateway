import { post } from '../utils';

export const BASE_URL = 'https://api.patronus.ai/v1/evaluate';

export const postPatronus = async (
  evaluator: string,
  credentials: any,
  data: any,
  timeout?: number,
  criteria: string | null = null
) => {
  const options = {
    headers: {
      'x-api-key': `${credentials.apiKey}`,
    },
  };

  const body = {
    evaluators: [
      {
        evaluator: evaluator,
        explain_strategy: 'always',
        ...(criteria && { criteria: criteria }),
      },
    ],
    evaluated_model_input: data.input,
    evaluated_model_output: data.output,
    // "evaluated_model_retrieved_context": ["I am John."]
  };

  return post(BASE_URL, body, options, timeout);
};

interface Position {
  positions: [number, number][];
  extra: any;
  confidence_interval: any;
}

// For finding all longest positions of equal length
interface AllLongestPositionsResult {
  positions: [number, number][];
  length: number;
}

export function findAllLongestPositions(
  data: Position
): AllLongestPositionsResult | null {
  if (!data?.positions?.length) {
    return null;
  }

  // Calculate max length
  const maxLength = Math.max(...data.positions.map((pos) => pos[1] - pos[0]));

  // Find all positions with max length
  const longestPositions = data.positions.filter(
    (pos) => pos[1] - pos[0] === maxLength
  );

  return {
    positions: longestPositions,
    length: maxLength,
  };
}
