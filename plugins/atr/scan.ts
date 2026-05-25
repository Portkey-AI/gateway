import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText } from '../utils';

export type AtrSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AtrRule {
  id: string;
  severity: AtrSeverity;
  regex: string;
  flags?: string;
}

interface AtrMatch {
  rule_id: string;
  severity: AtrSeverity;
}

interface AtrParameters extends PluginParameters {
  rules?: AtrRule[];
  severity_threshold?: AtrSeverity;
}

const SEVERITY_RANK: Record<AtrSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_THRESHOLD: AtrSeverity = 'high';

const evaluateRules = (content: string, rules: AtrRule[]): AtrMatch[] => {
  const matches: AtrMatch[] = [];
  for (const rule of rules) {
    if (!rule || !rule.regex || !rule.id || !rule.severity) {
      continue;
    }
    try {
      const flags = rule.flags ?? 'i';
      const pattern = new RegExp(rule.regex, flags);
      if (pattern.test(content)) {
        matches.push({ rule_id: rule.id, severity: rule.severity });
      }
    } catch {
      // Skip rules with invalid regex rather than failing the whole scan.
      continue;
    }
  }
  return matches;
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: AtrParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: any = null;

  try {
    const content = getText(context, eventType);
    if (!content) {
      return { error: null, verdict: true, data: null };
    }

    const rules = Array.isArray(parameters.rules) ? parameters.rules : [];
    if (rules.length === 0) {
      return { error: null, verdict: true, data: null };
    }

    const threshold =
      SEVERITY_RANK[parameters.severity_threshold ?? DEFAULT_THRESHOLD] ??
      SEVERITY_RANK[DEFAULT_THRESHOLD];

    const allMatches = evaluateRules(content, rules);
    const blocking = allMatches.filter(
      (match) => SEVERITY_RANK[match.severity] >= threshold
    );
    const belowThreshold = allMatches.filter(
      (match) => SEVERITY_RANK[match.severity] < threshold
    );

    if (blocking.length > 0) {
      verdict = false;
      data = {
        matched_rules: blocking.map((match) => match.rule_id),
        below_threshold: belowThreshold.map((match) => match.rule_id),
        reason: 'ATR rules matched at or above severity threshold',
      };
    } else {
      data = {
        matched_rules: [],
        below_threshold: belowThreshold.map((match) => match.rule_id),
      };
    }
  } catch (e: any) {
    error = e;
    verdict = true;
    data = null;
  }

  return { error, verdict, data };
};
