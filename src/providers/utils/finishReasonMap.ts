import { ANTHROPIC_STOP_REASON } from '../anthropic/types';
import { FINISH_REASON, PROVIDER_FINISH_REASON } from '../types';
import {
  BEDROCK_CONVERSE_STOP_REASON,
  TITAN_STOP_REASON,
} from '../bedrock/types';
import { VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON } from '../google-vertex-ai/types';
import { GOOGLE_GENERATE_CONTENT_FINISH_REASON } from '../google/types';
import { DEEPSEEK_STOP_REASON } from '../deepseek/types';
import { MISTRAL_AI_FINISH_REASON } from '../mistral-ai/types';
import { TOGETHER_AI_FINISH_REASON } from '../together-ai/types';
import { COHERE_STOP_REASON } from '../cohere/types';

// TODO: rename this to OpenAIFinishReasonMap
export const finishReasonMap = new Map<PROVIDER_FINISH_REASON, FINISH_REASON>([
  // https://docs.anthropic.com/en/api/messages#response-stop-reason
  [ANTHROPIC_STOP_REASON.stop_sequence, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.end_turn, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.pause_turn, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.tool_use, FINISH_REASON.tool_calls],
  [ANTHROPIC_STOP_REASON.max_tokens, FINISH_REASON.length],
  // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_ResponseSyntax
  [BEDROCK_CONVERSE_STOP_REASON.end_turn, FINISH_REASON.stop],
  [BEDROCK_CONVERSE_STOP_REASON.tool_use, FINISH_REASON.tool_calls],
  [BEDROCK_CONVERSE_STOP_REASON.max_tokens, FINISH_REASON.length],
  [BEDROCK_CONVERSE_STOP_REASON.stop_sequence, FINISH_REASON.stop],
  [
    BEDROCK_CONVERSE_STOP_REASON.guardrail_intervened,
    FINISH_REASON.content_filter,
  ],
  [BEDROCK_CONVERSE_STOP_REASON.content_filtered, FINISH_REASON.content_filter],
  // https://cloud.google.com/vertex-ai/generative-ai/docs/reference/nodejs/latest/vertexai/finishreason?hl=en
  [VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.STOP, FINISH_REASON.stop],
  [VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.RECITATION, FINISH_REASON.stop],
  [VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.OTHER, FINISH_REASON.stop],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.FINISH_REASON_UNSPECIFIED,
    FINISH_REASON.stop,
  ],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.MAX_TOKENS,
    FINISH_REASON.length,
  ],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.SAFETY,
    FINISH_REASON.content_filter,
  ],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.PROHIBITED_CONTENT,
    FINISH_REASON.content_filter,
  ],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.BLOCKLIST,
    FINISH_REASON.content_filter,
  ],
  [
    VERTEX_GEMINI_GENERATE_CONTENT_FINISH_REASON.SPII,
    FINISH_REASON.content_filter,
  ],
  // https://ai.google.dev/api/generate-content#FinishReason
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.FINISH_REASON_UNSPECIFIED,
    FINISH_REASON.stop,
  ],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.STOP, FINISH_REASON.stop],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.MAX_TOKENS, FINISH_REASON.length],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.SAFETY, FINISH_REASON.content_filter],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.RECITATION, FINISH_REASON.stop],
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.LANGUAGE,
    FINISH_REASON.content_filter,
  ],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.OTHER, FINISH_REASON.stop],
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.BLOCKLIST,
    FINISH_REASON.content_filter,
  ],
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.PROHIBITED_CONTENT,
    FINISH_REASON.content_filter,
  ],
  [GOOGLE_GENERATE_CONTENT_FINISH_REASON.SPII, FINISH_REASON.content_filter],
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.MALFORMED_FUNCTION_CALL,
    FINISH_REASON.stop,
  ],
  [
    GOOGLE_GENERATE_CONTENT_FINISH_REASON.IMAGE_SAFETY,
    FINISH_REASON.content_filter,
  ],
  // https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-titan-text.html
  [TITAN_STOP_REASON.FINISHED, FINISH_REASON.stop],
  [TITAN_STOP_REASON.LENGTH, FINISH_REASON.length],
  [TITAN_STOP_REASON.STOP_CRITERIA_MET, FINISH_REASON.stop],
  [TITAN_STOP_REASON.RAG_QUERY_WHEN_RAG_DISABLED, FINISH_REASON.stop],
  [TITAN_STOP_REASON.CONTENT_FILTERED, FINISH_REASON.content_filter],
  // https://api-docs.deepseek.com/api/create-chat-completion#:~:text=Array%20%5B-,finish_reason,-string
  [DEEPSEEK_STOP_REASON.stop, FINISH_REASON.stop],
  [DEEPSEEK_STOP_REASON.length, FINISH_REASON.length],
  [DEEPSEEK_STOP_REASON.tool_calls, FINISH_REASON.tool_calls],
  [DEEPSEEK_STOP_REASON.content_filter, FINISH_REASON.content_filter],
  [DEEPSEEK_STOP_REASON.insufficient_system_resource, FINISH_REASON.stop],
  // https://docs.mistral.ai/api/#tag/chat/operation/chat_completion_v1_chat_completions_post
  [MISTRAL_AI_FINISH_REASON.STOP, FINISH_REASON.stop],
  [MISTRAL_AI_FINISH_REASON.LENGTH, FINISH_REASON.length],
  [MISTRAL_AI_FINISH_REASON.MODEL_LENGTH, FINISH_REASON.length],
  [MISTRAL_AI_FINISH_REASON.TOOL_CALLS, FINISH_REASON.tool_calls],
  [MISTRAL_AI_FINISH_REASON.ERROR, FINISH_REASON.stop],
  // https://docs.together.ai/reference/chat-completions-1
  [TOGETHER_AI_FINISH_REASON.STOP, FINISH_REASON.stop],
  [TOGETHER_AI_FINISH_REASON.EOS, FINISH_REASON.stop],
  [TOGETHER_AI_FINISH_REASON.LENGTH, FINISH_REASON.length],
  [TOGETHER_AI_FINISH_REASON.TOOL_CALLS, FINISH_REASON.tool_calls],
  [TOGETHER_AI_FINISH_REASON.FUNCTION_CALL, FINISH_REASON.function_call],
  // https://docs.cohere.com/reference/chat#response.body.finish_reason
  [COHERE_STOP_REASON.complete, FINISH_REASON.stop],
  [COHERE_STOP_REASON.stop_sequence, FINISH_REASON.stop],
  [COHERE_STOP_REASON.max_tokens, FINISH_REASON.length],
  [COHERE_STOP_REASON.tool_call, FINISH_REASON.tool_calls],
  [COHERE_STOP_REASON.error, FINISH_REASON.stop],
  [COHERE_STOP_REASON.timeout, FINISH_REASON.stop],
]);

export const AnthropicFinishReasonMap = new Map<
  PROVIDER_FINISH_REASON,
  ANTHROPIC_STOP_REASON
>([
  // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_ResponseSyntax
  [BEDROCK_CONVERSE_STOP_REASON.end_turn, ANTHROPIC_STOP_REASON.end_turn],
  [BEDROCK_CONVERSE_STOP_REASON.tool_use, ANTHROPIC_STOP_REASON.tool_use],
  [BEDROCK_CONVERSE_STOP_REASON.max_tokens, ANTHROPIC_STOP_REASON.max_tokens],
  [
    BEDROCK_CONVERSE_STOP_REASON.stop_sequence,
    ANTHROPIC_STOP_REASON.stop_sequence,
  ],
  [
    BEDROCK_CONVERSE_STOP_REASON.guardrail_intervened,
    ANTHROPIC_STOP_REASON.end_turn,
  ],
  [
    BEDROCK_CONVERSE_STOP_REASON.content_filtered,
    ANTHROPIC_STOP_REASON.end_turn,
  ],
]);
