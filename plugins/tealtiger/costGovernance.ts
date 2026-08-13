import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from "../types";
import { getText } from "../utils";

// Approximate token estimation (4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Default pricing (per 1K tokens) — conservative estimates
const DEFAULT_INPUT_PRICE = 0.0005; // $0.50 per 1M tokens
const DEFAULT_OUTPUT_PRICE = 0.0015; // $1.50 per 1M tokens

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: Record<string, unknown> = {};

  try {
    const text = getText(context, eventType);
    const maxCost = parseFloat((parameters.maxCostPerRequest as string) || "0.50");

    if (!text) {
      return { error: null, verdict: true, data: { message: "No text to estimate cost" } };
    }

    const estimatedInputTokens = estimateTokens(text);
    // Assume output could be up to 2x input for worst-case estimation
    const estimatedOutputTokens = estimatedInputTokens * 2;

    const estimatedCost =
      (estimatedInputTokens / 1000) * DEFAULT_INPUT_PRICE +
      (estimatedOutputTokens / 1000) * DEFAULT_OUTPUT_PRICE;

    if (estimatedCost > maxCost) {
      verdict = false;
      data = {
        message: `Estimated cost $${estimatedCost.toFixed(4)} exceeds limit $${maxCost.toFixed(2)}`,
        estimatedCost,
        maxCost,
        estimatedInputTokens,
        estimatedOutputTokens,
        governanceDecision: "DENY",
        reasonCodes: ["BUDGET_EXCEEDED"],
        riskScore: 70,
        evaluationEngine: "tealtiger",
      };
    } else {
      data = {
        message: `Estimated cost $${estimatedCost.toFixed(4)} within limit $${maxCost.toFixed(2)}`,
        estimatedCost,
        maxCost,
        estimatedInputTokens,
        governanceDecision: "ALLOW",
        reasonCodes: ["WITHIN_BUDGET"],
        riskScore: 0,
        evaluationEngine: "tealtiger",
      };
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e : new Error(String(e));
    verdict = true; // Fail open
    data = { message: "Cost estimation error — failing open" };
  }

  return { error, verdict, data };
};
