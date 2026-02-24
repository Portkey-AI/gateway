import { Index, Pinecone } from '@pinecone-database/pinecone';
import {
  SimilarityMetric,
  VectorDBClient,
  VectorRecord,
} from '../vectorDBClient';
import { logger } from '../../apm';
import { Environment } from '../../utils/env';

const {
  VECTOR_STORE_ADDRESS: pineconeIndexHost,
  VECTOR_STORE_API_KEY: pineconeApiKey,
} = Environment({});

export class PineconeClient extends VectorDBClient {
  private client: Index | undefined;

  constructor() {
    super();

    if (pineconeApiKey && pineconeIndexHost) {
      this.client = new Pinecone().index(pineconeIndexHost);
      logger.info('Pinecone client initialized');
    } else {
      logger.warn(
        'Skipping Pinecone initialization: missing VECTOR_STORE_API_KEY or VECTOR_STORE_ADDRESS'
      );
    }
  }

  getMetricType(): SimilarityMetric {
    return SimilarityMetric.COSINE;
  }

  private createPineconeMetaFilters(metadata: Record<string, any>) {
    const filter: Record<string, any> = {};
    Object.keys(metadata).forEach((key) => {
      if (metadata[key] !== null) {
        filter[key] = { $eq: metadata[key] };
      }
    });
    return filter;
  }

  async upsert(upsertData: VectorRecord[], namespace: string) {
    if (!this.client) {
      throw new Error('Pinecone client not initialized');
    }
    await this.client.namespace(namespace).upsert(upsertData);
  }

  async query(
    vector: number[],
    topK: number,
    metadata: object,
    namespace: string
  ) {
    if (!this.client) {
      throw new Error('Pinecone client not initialized');
    }
    const filter = this.createPineconeMetaFilters(metadata);
    return this.client
      .namespace(namespace)
      .query({ vector, topK, filter: filter || {} });
  }

  async delete(id: string, namespace: string) {
    if (!this.client) {
      throw new Error('Pinecone client not initialized');
    }
    return this.client.namespace(namespace).deleteOne(id);
  }
}
