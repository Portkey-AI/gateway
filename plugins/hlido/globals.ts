export const HLIDO_BASE_URL = 'https://hlido.eu';

export interface HlidoScorecard {
  slug: string;
  name?: string;
  score?: number | null;
  tier?: string | null;
  staleness_after?: string | null;
}

// Fetch a public Hlido scorecard. Public + CORS-open + no auth; returns null on
// 404 (unreviewed) so the caller can distinguish "unreviewed" from "error".
export const getScorecard = async (
  slug: string,
  timeout?: number
): Promise<HlidoScorecard | null> => {
  const controller = new AbortController();
  const id = timeout
    ? setTimeout(() => controller.abort(), timeout)
    : undefined;
  try {
    const res = await fetch(
      `${HLIDO_BASE_URL}/data/scorecards/${encodeURIComponent(slug)}.json`,
      { signal: controller.signal }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Hlido API returned ${res.status}`);
    return (await res.json()) as HlidoScorecard;
  } finally {
    if (id) clearTimeout(id);
  }
};
