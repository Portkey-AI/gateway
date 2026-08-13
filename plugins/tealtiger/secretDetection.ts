import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from "../types";
import { getText } from "../utils";

// Secret detection patterns (deterministic regex)
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "openai_key", pattern: /\bsk-[a-zA-Z0-9]{20,}\b/g },
  { name: "github_pat", pattern: /\bghp_[a-zA-Z0-9]{36,}\b/g },
  { name: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "slack_token", pattern: /\bxox[bpors]-[a-zA-Z0-9-]+\b/g },
  { name: "generic_api_key", pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[a-zA-Z0-9_\-]{20,}/gi },
  { name: "private_key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g },
  { name: "jwt_token", pattern: /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]+\b/g },
];

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

    if (!text) {
      return { error: null, verdict: true, data: { message: "No text content to scan" } };
    }

    // Scan for secrets
    const findings: string[] = [];

    for (const { name, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        findings.push(name);
      }
    }

    if (findings.length > 0) {
      verdict = false;
      data = {
        message: `Secrets detected: ${findings.join(", ")}`,
        secretTypes: findings,
        governanceDecision: "DENY",
        reasonCodes: ["SECRET_DETECTED"],
        riskScore: 95,
        evaluationEngine: "tealtiger",
      };
    } else {
      data = {
        message: "No secrets detected",
        governanceDecision: "ALLOW",
        reasonCodes: ["CLEAN"],
        riskScore: 0,
        evaluationEngine: "tealtiger",
      };
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e : new Error(String(e));
    verdict = true; // Fail open
    data = { message: "Governance evaluation error — failing open" };
  }

  return { error, verdict, data };
};
