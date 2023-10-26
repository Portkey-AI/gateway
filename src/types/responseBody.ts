interface OpenAIChoiceMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  index: string;
  finish_reason: string;
  message?: OpenAIChoiceMessage;
  text?: string;
  logprobs?: any;
}
interface OpenAIUsage {
  completion_tokens: number;
}

interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: string;
  choices: OpenAIChoice[];
  model: string;
  usage: OpenAIUsage;
}

interface CohereGeneration {
  id: string;
  text: string;
  finish_reason: string;
}

interface CohereStreamResponse {
  id: string;
  generations: CohereGeneration[];
  prompt: string;
}

interface ParsedChunk {
  is_finished: boolean;
  finish_reason: string;
  response?: {
    id: string;
    generations: CohereGeneration[];
    prompt: string;
  };
  text?: string;
}

interface AnthropicStreamResponse {
  completion: string;
  stop_reason: string;
  model: string;
  truncated: boolean;
  stop: null | string;
  log_id: string;
  exception: any | null;
}
