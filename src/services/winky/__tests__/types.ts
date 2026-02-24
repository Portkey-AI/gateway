import { Tokens } from '../../../providers/types';

export interface TestCase {
  provider: string;
  model: string;
  description: string;
  tokens: Tokens;
  requestBody: Record<string, any>;
  expected: {
    requestCost: number;
    responseCost: number;
    currency: string;
  };
}
