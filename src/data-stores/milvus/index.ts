import {
  InsertReq,
  MilvusClient as Client,
  SearchResults,
} from '@zilliz/milvus2-sdk-node';
import {
  SimilarityMetric,
  VectorDBClient,
  VectorRecord,
  VectorRecordResponse,
} from '../vectorDBClient';
import { logger } from '../../apm';
import { Environment } from '../../utils/env';

const {
  VECTOR_STORE_ADDRESS,
  VECTOR_STORE_COLLECTION_NAME = 'textEmbedding3Small',
  VECTOR_STORE_API_KEY,
} = Environment({});

export class MilvusClient extends VectorDBClient {
  private client: Client | undefined;

  constructor() {
    super();

    if (VECTOR_STORE_ADDRESS && VECTOR_STORE_API_KEY) {
      this.client = new Client({
        address: VECTOR_STORE_ADDRESS,
        token: VECTOR_STORE_API_KEY,
      });
      this.client.loadCollection({
        collection_name: VECTOR_STORE_COLLECTION_NAME,
      });
      logger.info('Milvus client initialized');
    } else {
      logger.error(
        'Skipping Milvus initialization: missing VECTOR_STORE_ADDRESS or VECTOR_STORE_API_KEY'
      );
    }
  }

  getMetricType(): SimilarityMetric {
    return SimilarityMetric.COSINE;
  }

  private transformUpsertData(
    upsertData: VectorRecord[],
    namespace: string
  ): InsertReq {
    return {
      data: upsertData.map((record) => ({
        id: record.id,
        vector: record.values,
        workspace_id: namespace,
        ...record.metadata,
      })),
      collection_name: VECTOR_STORE_COLLECTION_NAME,
    };
  }

  private async transformResults(
    results: SearchResults
  ): Promise<VectorRecordResponse> {
    return {
      matches: results.results.map((result) => ({
        id: result.id,
        score: result.score,
        values: result.vector,
      })),
    };
  }

  private createFilter(namespace: string, metadata?: Record<string, any>) {
    let filter = `workspace_id == "${namespace}"`;
    if (metadata) {
      Object.keys(metadata).forEach((key) => {
        if (typeof metadata[key] === 'string') {
          filter += ` && ${key} IN ["${metadata[key]}"]`;
        } else if (typeof metadata[key] === 'number') {
          filter += ` && ${key} == ${metadata[key]}`;
        } else if (typeof metadata[key] === 'boolean') {
          filter += ` && ${key} == ${metadata[key]}`;
        }
      });
    }
    return filter;
  }

  async upsert(upsertData: VectorRecord[], namespace: string) {
    logger.debug('upserting data to milvus with namespace', namespace);
    if (!this.client) {
      throw new Error('Milvus client not initialized');
    }
    const transformedData = this.transformUpsertData(upsertData, namespace);
    await this.client.upsert(transformedData);
  }

  async query(
    vector: number[],
    topK: number,
    metadata: Record<string, any>,
    namespace: string
  ) {
    logger.debug('querying record from milvus');
    if (!this.client) {
      throw new Error('Milvus client not initialized');
    }
    const filter = this.createFilter(namespace, metadata);
    return this.client
      .search({
        vector,
        collection_name: VECTOR_STORE_COLLECTION_NAME,
        topk: topK,
        filter,
      })
      .then((res) => this.transformResults(res));
  }

  async delete(id: string, namespace: string) {
    logger.debug(
      `deleting record from milvus with id: ${id}, namespace: ${namespace}`
    );
    if (!this.client) {
      throw new Error('Milvus client not initialized');
    }
    const filter = this.createFilter(namespace);
    await this.client.delete({
      collection_name: VECTOR_STORE_COLLECTION_NAME,
      ids: [id],
      filter,
    });
  }
}
