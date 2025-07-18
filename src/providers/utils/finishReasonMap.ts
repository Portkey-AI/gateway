import { ANTHROPIC_STOP_REASON } from '../anthropic/types';
import { FINISH_REASON, PROVIDER_FINISH_REASON } from '../types';
import { BEDROCK_STOP_REASON } from '../bedrock/types';

export const finishReasonMap = new Map<PROVIDER_FINISH_REASON, FINISH_REASON>([
  // https://docs.anthropic.com/en/api/messages#response-stop-reason
  [ANTHROPIC_STOP_REASON.stop_sequence, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.end_turn, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.pause_turn, FINISH_REASON.stop],
  [ANTHROPIC_STOP_REASON.tool_use, FINISH_REASON.tool_calls],
  [ANTHROPIC_STOP_REASON.max_tokens, FINISH_REASON.length],
  // https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html#API_runtime_Converse_ResponseSyntax
  [BEDROCK_STOP_REASON.end_turn, FINISH_REASON.stop],
  [BEDROCK_STOP_REASON.tool_use, FINISH_REASON.tool_calls],
  [BEDROCK_STOP_REASON.max_tokens, FINISH_REASON.length],
  [BEDROCK_STOP_REASON.stop_sequence, FINISH_REASON.stop],
  [BEDROCK_STOP_REASON.guardrail_intervened, FINISH_REASON.content_filter],
  [BEDROCK_STOP_REASON.content_filtered, FINISH_REASON.content_filter],
]);
