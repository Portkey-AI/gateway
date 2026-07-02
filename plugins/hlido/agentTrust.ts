import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getScorecard } from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  _eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: any = null;

  try {
    const slug: string | undefined =
      parameters.slug || (context.provider as string | undefined);
    if (!slug) {
      return {
        error: new Error('hlido: no `slug` parameter and no request provider to check'),
        verdict: true,
        data: null,
      };
    }

    const minScore =
      typeof parameters.minScore === 'number' ? parameters.minScore : 70;
    const failOnUnreviewed = parameters.failOnUnreviewed === true;

    const scorecard = await getScorecard(slug, parameters.timeout);

    if (!scorecard) {
      verdict = !failOnUnreviewed;
      data = {
        slug,
        reviewed: false,
        explanation: `No independent Hlido review for "${slug}". ${
          failOnUnreviewed ? 'Blocked (failOnUnreviewed).' : 'Passed (no review to gate on).'
        }`,
        check_url: `https://hlido.eu/check/?agent=${encodeURIComponent(slug)}`,
      };
      return { error, verdict, data };
    }

    const score = typeof scorecard.score === 'number' ? scorecard.score : null;
    verdict = score !== null ? score >= minScore : !failOnUnreviewed;
    data = {
      slug,
      reviewed: true,
      score,
      tier: scorecard.tier ?? null,
      minScore,
      passed: verdict,
      explanation:
        score !== null
          ? `Hlido trust score ${score} (${scorecard.tier}) vs minimum ${minScore} → ${
              verdict ? 'passed' : 'blocked'
            }.`
          : `Hlido review exists but has no numeric score; ${
              verdict ? 'passed' : 'blocked'
            }.`,
      review_url: `https://hlido.eu/reviews/${encodeURIComponent(slug)}/`,
    };
  } catch (e: any) {
    delete e.stack;
    error = e;
  }

  return { error, verdict, data };
};
