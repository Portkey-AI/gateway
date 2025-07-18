export async function runInBatches<T>(
  batchSize: number,
  maxSize: number,
  processFn: (index: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < maxSize; i += batchSize) {
    const batchIndices = Array.from(
      { length: Math.min(batchSize, maxSize - i) },
      (_, index) => i + index
    );
    const batchResults = await Promise.all(
      batchIndices.map((index) => processFn(index))
    );
    results.push(...batchResults);
  }
  return results;
}

export function toSnakeCase(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // Handle camelCase and PascalCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2') // Handle acronyms
    .replace(/[^a-zA-Z0-9]+/g, '_') // Replace special characters with '_'
    .replace(/_+/g, '_') // Merge multiple underscores
    .toLowerCase();
}
