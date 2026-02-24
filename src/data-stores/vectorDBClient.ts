type RecordMetadataValue = string | boolean | number | Array<string>;

export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, RecordMetadataValue>;
}

export interface Match extends VectorRecord {
  score?: number;
}

export interface VectorRecordResponse {
  matches: Match[];
}

export enum SimilarityMetric {
  COSINE = 'cosine',
  L2 = 'l2',
  IP = 'ip',
}

// we're not maintaining a queue for inserting data as it's for semantic cache, it's okay if some items are not put in cache
export abstract class VectorDBClient {
  abstract getMetricType(): SimilarityMetric;

  abstract upsert(upsertData: VectorRecord[], namespace: string): Promise<void>;
  abstract query(
    vector: number[],
    topK: number,
    filter: object,
    namespace: string
  ): Promise<VectorRecordResponse>;
  abstract delete(id: string, namespace: string): Promise<void>;

  meetsThreshold(score: number | undefined, threshold: number): boolean {
    if (score === undefined) return false;
    if (threshold <= 0) return true; // No threshold filtering

    const metric = this.getMetricType() || SimilarityMetric.COSINE;
    switch (metric) {
      case SimilarityMetric.COSINE:
      case SimilarityMetric.IP:
        return score >= threshold;
      case SimilarityMetric.L2:
        return 1 - score / 2 >= threshold;
      default:
        return score >= threshold;
    }
  }
}
