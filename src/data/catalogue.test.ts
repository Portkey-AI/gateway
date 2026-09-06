import models from './models.json';
import providers from './providers.json';

/**
 * These two files are hand-maintained catalogues, and a repeated row is invisible:
 * the file still parses, nothing throws, and any consumer that indexes by key just
 * keeps whichever copy it happens to see last. Nobody is told a row was shadowed.
 *
 * A model is identified by (provider, id) rather than id alone - the same model is
 * legitimately offered by more than one provider, e.g. `jamba-1.5-large` under both
 * `ai21` and `vertex-ai`. Only a repeat of the same model under the same provider
 * is a duplicate.
 */

const duplicatesOf = (keys: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }

  return [...duplicates].sort();
};

describe('data catalogues', () => {
  it('lists each model once per provider', () => {
    // Scanning an empty list must not look like a pass.
    expect(models.data.length).toBeGreaterThan(0);

    const keys = models.data.map((model) => `${model.provider.id}/${model.id}`);

    expect(duplicatesOf(keys)).toEqual([]);
  });

  it('lists each provider once', () => {
    expect(providers.data.length).toBeGreaterThan(0);

    expect(duplicatesOf(providers.data.map((provider) => provider.id))).toEqual(
      []
    );
  });
});
