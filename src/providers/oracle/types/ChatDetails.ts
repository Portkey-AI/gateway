/**
 * Auto-generated type definitions extracted from the oci-generativeai TypeScript SDK (Oracle Cloud Infrastructure Generative AI)
 * Source: https://raw.githubusercontent.com/oracle/oci-typescript-sdk/refs/heads/master/lib/generativeaiinference/lib/model/chat-details.ts
 * For Script refer to github gist
 * Generated: 2025-11-21T21:44:31.445Z
 */

import { JsonSchema } from '../../../types/requestBody';

export type OracleMessageRole =
  | 'SYSTEM'
  | 'ASSISTANT'
  | 'USER'
  | 'TOOL'
  | 'DEVELOPER';

export interface ChatDetails {
  /**
   * The OCID of compartment in which to call the Generative AI service to chat.
   */
  compartmentId: string;
  servingMode: DedicatedServingMode | OnDemandServingMode;
  chatRequest: GenericChatRequest | CohereChatRequest;
}

export interface ServingMode {
  servingType: string;
}

export interface DedicatedServingMode extends ServingMode {
  /**
   * The OCID of the endpoint to use.
   */
  endpointId: string;

  servingType: string;
}

export interface OnDemandServingMode extends ServingMode {
  /**
   * The unique ID of a model to use. You can use the {@link #listModels(ListModelsRequest) listModels} API to list the available models.
   */
  modelId: string;

  servingType: string;
}

export interface ChatContent {
  type: string;
  [key: string]: any;
}

export interface Message {
  /**
   * Contents of the chat message.
   */
  content?: Array<ChatContent>;

  role: string;
}

export interface StreamOptions {
  /**
   * If set, an additional chunk will be streamed before the data: [DONE] message. The usage field on this chunk shows the token usage statistics for the entire request
   *
   */
  isIncludeUsage?: boolean;
}

export interface TextContent extends ChatContent {
  /**
   * The text content.
   */
  text?: string;

  type: string;
}

export interface Prediction {
  type: string;
}

export interface StaticContent extends Prediction {
  /**
   * The content that should be matched when generating a model response. If generated tokens would match this content, the entire model response can be returned much more quickly.
   *
   */
  content?: Array<TextContent>;

  type: string;
}

export interface ResponseFormat {
  type: string;
}

export interface TextResponseFormat extends ResponseFormat {
  type: string;
}

export interface JsonObjectResponseFormat extends ResponseFormat {
  type: string;
}

export interface ResponseJsonSchema {
  /**
   * The name of the response format. Must be a-z, A-Z, 0-9, or contain underscores and dashes.
   */
  name: string;
  /**
   * A description of what the response format is for, used by the model to determine how to respond in the format.
   */
  description?: string;
  /**
   * The schema used by the structured output, described as a JSON Schema object.
   */
  schema?: any;
  /**
   * Whether to enable strict schema adherence when generating the output. If set to true, the model will always follow the exact schema defined in the schema field. Only a subset of JSON Schema is supported when strict is true.
   *
   */
  isStrict?: boolean;
}

export interface JsonSchemaResponseFormat extends ResponseFormat {
  jsonSchema?: ResponseJsonSchema;

  type: string;
}

export interface ToolChoice {
  type: string;
}

export interface ToolChoiceFunction extends ToolChoice {
  /**
   * The function name.
   */
  name?: string;

  type: string;
}

export interface ToolChoiceNone extends ToolChoice {
  type: string;
}

export interface ToolChoiceAuto extends ToolChoice {
  type: string;
}

export interface ToolChoiceRequired extends ToolChoice {
  type: string;
}

export interface ToolDefinition {
  type: string;
  description?: string;
  parameters?: JsonSchema;
  name?: string;
}

export interface ApproximateLocation {
  /**
   * Approximate city name, like \"Minneapolis\".
   */
  city?: string;
  /**
   * Approximate region or state, like \"Minnesota\".
   */
  region?: string;
  /**
   * Two-letter ISO country code.
   */
  country?: string;
  /**
   * IANA timezone string.
   */
  timezone?: string;
}

export interface WebSearchOptions {
  /**
   * Specifies the size of the web search context.
   *   - HIGH: Most comprehensive context, highest cost, slower response.
   *   - MEDIUM: Balanced context, cost, and latency.
   *   - LOW: Least context, lowest cost, fastest response, but potentially lower answer quality.
   *
   */
  searchContextSize?: WebSearchOptions.SearchContextSize;
  userLocation?: ApproximateLocation;
}

export namespace WebSearchOptions {
  export type SearchContextSize = 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface BaseChatRequest {
  apiFormat: string;
}

export interface GenericChatRequest extends BaseChatRequest {
  /**
   * The series of messages in a chat request. Includes the previous messages in a conversation. Each message includes a role ({@code USER} or the {@code CHATBOT}) and content.
   */
  messages?: Array<Message>;
  /**
   * Constrains effort on reasoning for reasoning models. Currently supported values are minimal, low, medium, and high. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response.
   *
   */
  reasoningEffort?: GenericChatRequest.ReasoningEffort;
  /**
   * Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses.
   *
   */
  verbosity?: GenericChatRequest.Verbosity;
  /**
    * Set of 16 key-value pairs that can be attached to an object. This can be useful for storing additional information about the object in a structured format, and querying for objects via API or the dashboard.
* <p>
Keys are strings with a maximum length of 64 characters. Values are strings with a maximum length of 512 characters.
* 
    */
  metadata?: any;
  /**
   * Whether to stream back partial progress. If set to true, as tokens become available, they are sent as data-only server-sent events.
   */
  isStream?: boolean;
  streamOptions?: StreamOptions;
  /**
   * The number of of generated texts that will be returned. Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  numGenerations?: number;
  /**
   * If specified, the backend will make a best effort to sample tokens deterministically, so that repeated requests with the same seed and parameters yield the same result. However, determinism cannot be fully guaranteed.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  seed?: number;
  /**
   * Whether to include the user prompt in the response. Applies only to non-stream results.
   */
  isEcho?: boolean;
  /**
    * An integer that sets up the model to use only the top k most likely tokens in the generated output. A higher k introduces more randomness into the output making the output text sound more natural. Default value is -1 which means to consider all tokens. Setting to 0 disables this method and considers all tokens.
* <p>
If also using top p, then the model considers only the top tokens whose probabilities add up to p percent and ignores the rest of the k tokens. For example, if k is 20, but the probabilities of the top 10 add up to .75, then only the top 10 tokens are chosen.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  topK?: number;
  /**
    * If set to a probability 0.0 < p < 1.0, it ensures that only the most likely tokens, with total probability mass of p, are considered for generation at each step.
* <p>
To eliminate tokens with low likelihood, assign p a minimum percentage for the next token's likelihood. For example, when p is set to 0.75, the model eliminates the bottom 25 percent for the next token. Set to 1 to consider all tokens and set to 0 to disable. If both k and p are enabled, p acts after k.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  topP?: number;
  /**
    * A number that sets the randomness of the generated output. A lower temperature means a less random generations.
* <p>
Use lower numbers for tasks with a correct answer such as question answering or summarizing. High temperatures can generate hallucinations or factually incorrect information. Start with temperatures lower than 1.0 and increase the temperature for more creative outputs, as you regenerate the prompts to refine the outputs.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  temperature?: number;
  /**
   * To reduce repetitiveness of generated tokens, this number penalizes new tokens based on their frequency in the generated text so far. Values > 0 encourage the model to use new tokens and values < 0 encourage the model to repeat tokens. Set to 0 to disable. Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  frequencyPenalty?: number;
  /**
    * To reduce repetitiveness of generated tokens, this number penalizes new tokens based on whether they've appeared in the generated text so far. Values > 0 encourage the model to use new tokens and values < 0 encourage the model to repeat tokens.
* <p>
Similar to frequency penalty, a penalty is applied to previously present tokens, except that this penalty is applied equally to all tokens that have already appeared, regardless of how many times they've appeared. Set to 0 to disable.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  presencePenalty?: number;
  /**
   * List of strings that stop the generation if they are generated for the response text. The returned output will not contain the stop strings.
   */
  stop?: Array<string>;
  /**
    * Includes the logarithmic probabilities for the most likely output tokens and the chosen tokens.
* <p>
For example, if the log probability is 5, the API returns a list of the 5 most likely tokens. The API returns the log probability of the sampled token, so there might be up to logprobs+1 elements in the response.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  logProbs?: number;
  /**
   * The maximum number of tokens that can be generated per output sequence. The token count of your prompt plus maxTokens must not exceed the model's context length. For on-demand inferencing, the response length is capped at 4,000 tokens for each run.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  maxTokens?: number;
  /**
   * An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  maxCompletionTokens?: number;
  /**
    * Modifies the likelihood of specified tokens that appear in the completion.
* <p>
Example: '{\"6395\": 2, \"8134\": 1, \"21943\": 0.5, \"5923\": -100}'
* 
    */
  logitBias?: any;
  prediction?: StaticContent;
  responseFormat?:
    | TextResponseFormat
    | JsonObjectResponseFormat
    | JsonSchemaResponseFormat;
  toolChoice?:
    | ToolChoiceFunction
    | ToolChoiceNone
    | ToolChoiceAuto
    | ToolChoiceRequired;
  /**
   * Whether to enable parallel function calling during tool use.
   */
  isParallelToolCalls?: boolean;
  /**
   * A list of tools the model may call. Use this to provide a list of functions the model may generate JSON inputs for. A max of 128 functions are supported.
   */
  tools?: Array<ToolDefinition>;
  webSearchOptions?: WebSearchOptions;
  /**
   * Specifies the processing type used for serving the request.
   */
  serviceTier?: GenericChatRequest.ServiceTier;

  apiFormat: string;
}

export namespace GenericChatRequest {
  export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
  export type Verbosity = number;
  export type ServiceTier = string;
}

export interface CohereMessage {
  role: string;
}

export interface CohereResponseFormat {
  type: string;
}

export interface CohereResponseTextFormat extends CohereResponseFormat {
  type: string;
}

export interface CohereResponseJsonFormat extends CohereResponseFormat {
  /**
   * The schema used by the structured output, described as a JSON Schema object.
   */
  schema?: any;

  type: string;
}

export interface CohereParameterDefinition {
  description?: string;
  type?: string;
  required?: boolean;
}

export interface CohereTool {
  /**
   * The name of the tool to be called. Valid names contain only the characters a-z, A-Z, 0-9, _ and must not begin with a digit.
   */
  name: string;
  /**
   * The description of what the tool does, the model uses the description to choose when and how to call the function.
   */
  description: string;
  /**
   * The input parameters of the tool.
   */
  parameterDefinitions?: { [key: string]: CohereParameterDefinition };
}

export interface CohereToolCall {
  /**
   * Name of the tool to call.
   */
  name: string;
  /**
   * The parameters to use when invoking a tool.
   */
  parameters: any;
}

export interface CohereToolResult {
  call: CohereToolCall;
  /**
   * An array of objects returned by tool.
   */
  outputs: Array<any>;
}

export interface CohereChatRequest extends BaseChatRequest {
  /**
   * The text that the user inputs for the model to respond to.
   */
  message: string;
  /**
   * The list of previous messages between the user and the  The chat history gives the model context for responding to the user's inputs.
   */
  chatHistory?: Array<CohereMessage>;
  /**
    * A list of relevant documents that the model can refer to for generating grounded responses to the user's requests.
* Some example keys that you can add to the dictionary are \"text\", \"author\", and \"date\". Keep the total word count of the strings in the dictionary to 300 words or less.
* <p>
Example:
* {@code [
*   { \"title\": \"Tall penguins\", \"snippet\": \"Emperor penguins are the tallest.\" },
*   { \"title\": \"Penguin habitats\", \"snippet\": \"Emperor penguins only live in Antarctica.\" }
* ]}
* 
    */
  documents?: Array<any>;
  responseFormat?: CohereResponseTextFormat | CohereResponseJsonFormat;
  /**
   * When set to true, the response contains only a list of generated search queries without the search results and the model will not respond to the user's message.
   *
   */
  isSearchQueriesOnly?: boolean;
  /**
    * If specified, the default Cohere preamble is replaced with the provided preamble. A preamble is an initial guideline message that can change the model's overall chat behavior and conversation style. Default preambles vary for different models.
* <p>
Example: {@code You are a travel advisor. Answer with a pirate tone.}
* 
    */
  preambleOverride?: string;
  /**
   * Whether to stream the partial progress of the model's response. When set to true, as tokens become available, they are sent as data-only server-sent events.
   */
  isStream?: boolean;
  streamOptions?: StreamOptions;
  /**
   * The maximum number of output tokens that the model will generate for the response. The token count of your prompt plus maxTokens must not exceed the model's context length. For on-demand inferencing, the response length is capped at 4,000 tokens for each run.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  maxTokens?: number;
  /**
   * The maximum number of input tokens to send to the  If not specified, max_input_tokens is the model's context length limit minus a small buffer. Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  maxInputTokens?: number;
  /**
   * A number that sets the randomness of the generated output. A lower temperature means less random generations.
   * Use lower numbers for tasks such as question answering or summarizing. High temperatures can generate hallucinations or factually incorrect information. Start with temperatures lower than 1.0 and increase the temperature for more creative outputs, as you regenerate the prompts to refine the outputs.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  temperature?: number;
  /**
    * A sampling method in which the model chooses the next token randomly from the top k most likely tokens. A higher value for k generates more random output, which makes the output text sound more natural. The default value for k is 0 which disables this method and considers all tokens. To set a number for the likely tokens, choose an integer between 1 and 500.
* <p>
If also using top p, then the model considers only the top tokens whose probabilities add up to p percent and ignores the rest of the k tokens. For example, if k is 20 but only the probabilities of the top 10 add up to the value of p, then only the top 10 tokens are chosen.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  topK?: number;
  /**
    * If set to a probability 0.0 < p < 1.0, it ensures that only the most likely tokens, with total probability mass of p, are considered for generation at each step.
* <p>
To eliminate tokens with low likelihood, assign p a minimum percentage for the next token's likelihood. For example, when p is set to 0.75, the model eliminates the bottom 25 percent for the next token. Set to 1.0 to consider all tokens and set to 0 to disable. If both k and p are enabled, p acts after k.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  topP?: number;
  /**
   * Defaults to OFF. Dictates how the prompt will be constructed. With {@code promptTruncation} set to AUTO_PRESERVE_ORDER, some elements from {@code chatHistory} and {@code documents} will be dropped to construct a prompt that fits within the model's context length limit. During this process the order of the documents and chat history will be preserved. With {@code prompt_truncation} set to OFF, no elements will be dropped.
   *
   */
  promptTruncation?: CohereChatRequest.PromptTruncation;
  /**
   * To reduce repetitiveness of generated tokens, this number penalizes new tokens based on their frequency in the generated text so far. Greater numbers encourage the model to use new tokens, while lower numbers encourage the model to repeat the tokens. Set to 0 to disable.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  frequencyPenalty?: number;
  /**
    * To reduce repetitiveness of generated tokens, this number penalizes new tokens based on whether they've appeared in the generated text so far. Greater numbers encourage the model to use new tokens, while lower numbers encourage the model to repeat the tokens.
* <p>
Similar to frequency penalty, a penalty is applied to previously present tokens, except that this penalty is applied equally to all tokens that have already appeared, regardless of how many times they've appeared. Set to 0 to disable.
*  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
    */
  presencePenalty?: number;
  /**
   * If specified, the backend will make a best effort to sample tokens deterministically, so that repeated requests with the same seed and parameters yield the same result. However, determinism cannot be fully guaranteed.
   *  Note: Numbers greater than Number.MAX_SAFE_INTEGER will result in rounding issues.
   */
  seed?: number;
  /**
   * Returns the full prompt that was sent to the model when True.
   */
  isEcho?: boolean;
  /**
   * A list of available tools (functions) that the model may suggest invoking before producing a text response.
   */
  tools?: Array<CohereTool>;
  /**
   * A list of results from invoking tools recommended by the model in the previous chat turn.
   */
  toolResults?: Array<CohereToolResult>;
  /**
   * When enabled, the model will issue (potentially multiple) tool calls in a single step, before it receives the tool responses and directly answers the user's original message.
   *
   */
  isForceSingleStep?: boolean;
  /**
   * Stop the model generation when it reaches a stop sequence defined in this parameter.
   */
  stopSequences?: Array<string>;
  /**
   * When enabled, the user\u2019s {@code message} will be sent to the model without any preprocessing.
   */
  isRawPrompting?: boolean;
  /**
   * When FAST is selected, citations are generated at the same time as the text output and the request will be completed sooner. May result in less accurate citations.
   *
   */
  citationQuality?: CohereChatRequest.CitationQuality;
  /**
   * Safety mode: Adds a safety instruction for the model to use when generating responses.
   * Contextual: (Default) Puts fewer constraints on the output. It maintains core protections by aiming to reject harmful or illegal suggestions, but it allows profanity and some toxic content, sexually explicit and violent content, and content that contains medical, financial, or legal information. Contextual mode is suited for entertainment, creative, or academic use.
   * Strict: Aims to avoid sensitive topics, such as violent or sexual acts and profanity. This mode aims to provide a safer experience by prohibiting responses or recommendations that it finds inappropriate. Strict mode is suited for corporate use, such as for corporate communications and customer service.
   * Off: No safety mode is applied.
   * Note: This parameter is only compatible with models cohere.command-r-08-2024, cohere.command-r-plus-08-2024 and Cohere models released after these models. See [release dates](https://docs.oracle.com/iaas/Content/generative-ai/deprecating.htm).
   *
   */
  safetyMode?: CohereChatRequest.SafetyMode;

  apiFormat: string;
}

export namespace CohereChatRequest {
  export type PromptTruncation = 'AUTO_PRESERVE_ORDER' | 'OFF';
  export type CitationQuality = 'FAST' | 'ACCURATE';
  export type SafetyMode = 'CONTEXTUAL' | 'STRICT' | 'OFF';
}

export namespace ChatDetails {
  export function getJsonObj(obj: ChatDetails): object {
    const jsonObj = {
      ...obj,
      ...{
        servingMode: obj.servingMode || undefined,
        chatRequest: obj.chatRequest || undefined,
      },
    };

    return jsonObj;
  }
  export function getDeserializedJsonObj(obj: ChatDetails): object {
    const jsonObj = {
      ...obj,
      ...{
        servingMode: obj.servingMode || undefined,
        chatRequest: obj.chatRequest || undefined,
      },
    };

    return jsonObj;
  }
}
