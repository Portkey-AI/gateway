export interface MonsterAPIResponse {
    text: string[];
    token_counts: {
      input: number;
      output: number;
    };
    credits_consumed: number;
  }
  