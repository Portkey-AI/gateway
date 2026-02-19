import { PineconeClient } from '../../../data-stores/pinecone';
import { VectorDBClient } from '../../../data-stores/vectorDBClient';
import { logger } from '../../../apm';
import { Environment } from '../../../utils/env';

export enum SUPPORTED_VECTOR_STORES {
  PINECONE = 'pinecone',
  MILVUS = 'milvus',
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.95;

function getSimilarityThreshold(): number {
  const thresholdStr = Environment({}).SEMANTIC_CACHE_SIMILARITY_THRESHOLD;
  if (!thresholdStr) {
    return DEFAULT_SIMILARITY_THRESHOLD;
  }

  const threshold = parseFloat(thresholdStr);
  if (isNaN(threshold)) {
    logger.warn(
      `Invalid SEMANTIC_CACHE_SIMILARITY_THRESHOLD: ${thresholdStr}, using default: ${DEFAULT_SIMILARITY_THRESHOLD}`
    );
    return DEFAULT_SIMILARITY_THRESHOLD;
  }

  if (threshold < 0 || threshold > 1) {
    logger.warn(
      `SEMANTIC_CACHE_SIMILARITY_THRESHOLD must be between 0 and 1, got: ${threshold}, clamping to valid range`
    );
    return Math.max(0, Math.min(1, threshold));
  }

  return threshold;
}

export class VectorStore {
  private client: VectorDBClient;
  private similarityThreshold: number;

  private constructor(client: VectorDBClient) {
    this.client = client;
    this.similarityThreshold = getSimilarityThreshold();
  }

  static async create(
    vectorStore: SUPPORTED_VECTOR_STORES
  ): Promise<VectorStore | null> {
    try {
      let client: VectorDBClient;

      if (vectorStore === SUPPORTED_VECTOR_STORES.MILVUS) {
        const { MilvusClient } = await import('../../../data-stores/milvus');
        client = new MilvusClient();
      } else if (vectorStore === SUPPORTED_VECTOR_STORES.PINECONE) {
        client = new PineconeClient();
      } else {
        logger.warn(`Unsupported vector store: ${vectorStore}`);
        return null;
      }

      logger.info(
        `Initialized VectorStore: ${vectorStore}, similarity threshold: ${getSimilarityThreshold()}`
      );
      return new VectorStore(client);
    } catch (err) {
      logger.error(`Error initializing vector store: ${err}`);
      return null;
    }
  }

  async get(
    vector: number[],
    metadata: Record<string, any>,
    namespace: string,
    threshold?: number
  ): Promise<string | null> {
    try {
      const vectorStoreResponse = await this.client.query(
        vector,
        1,
        metadata,
        namespace
      );

      if (vectorStoreResponse?.matches?.length > 0) {
        const firstMatch = vectorStoreResponse.matches[0];
        const effectiveThreshold = threshold ?? this.similarityThreshold;

        if (this.client.meetsThreshold(firstMatch?.score, effectiveThreshold)) {
          return firstMatch?.id;
        }
      }
    } catch (err: any) {
      logger.error(`Error getting vector: ${err}`);
    }
    return null;
  }

  async put(
    key: string,
    vector: number[],
    metadata: Record<string, any> = {},
    namespace: string
  ): Promise<boolean> {
    try {
      const upsertVectors = [{ id: key, values: vector, metadata }];
      await this.client.upsert(upsertVectors, namespace);
      return true;
    } catch (err: any) {
      logger.error(`Error upserting vector: ${err}`);
      return false;
    }
  }

  async del(key: string, namespace: string): Promise<boolean> {
    try {
      await this.client.delete(key, namespace);
      return true;
    } catch (err: any) {
      logger.error(`Error deleting vector: ${err}`);
      return false;
    }
  }
}
