export type AnthropicStreamState = {
  containsChainOfThoughtMessage?: boolean;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};
