import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from "../types";
import { getText } from "../utils";

// PII detection patterns (deterministic regex — no LLM call)
const PII_PATTERNS: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  iban: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){2,7}[\dA-Z]{1,4}\b/g,
  passport: /\b[A-Z]\d{8}\b/g,
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: Record<string, unknown> = {};

  try {
    // Get text content from request or response
    const text = getText(context, eventType);

    if (!text) {
      return { error: null, verdict: true, data: { message: "No text content to scan" } };
    }

    // Determine which categories to scan
    const categoriesParam = parameters.categories as string | undefined;
    const categories = categoriesParam
      ? categoriesParam.split(",").map((c) => c.trim())
      : Object.keys(PII_PATTERNS);

    // Scan for PII
    const findings: Array<{ category: string; count: number }> = [];

    for (const category of categories) {
      const pattern = PII_PATTERNS[category];
      if (!pattern) continue;

      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      const matches = text.match(pattern);

      if (matches && matches.length > 0) {
        findings.push({ category, count: matches.length });
      }
    }

    if (findings.length > 0) {
      verdict = false;
      data = {
        message: `PII detected: ${findings.map((f) => `${f.category} (${f.count})`).join(", ")}`,
        findings,
        totalFindings: findings.reduce((sum, f) => sum + f.count, 0),
        governanceDecision: "DENY",
        reasonCodes: findings.map((f) => `PII_DETECTED:${f.category}`),
        riskScore: 90,
        evaluationEngine: "tealtiger",
      };
    } else {
      data = {
        message: "No PII detected",
        governanceDecision: "ALLOW",
        reasonCodes: ["CLEAN"],
        riskScore: 0,
        evaluationEngine: "tealtiger",
      };
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e : new Error(String(e));
    verdict = true; // Fail open on error
    data = { message: "Governance evaluation error — failing open" };
  }

  return { error, verdict, data };
};
