import { logger } from '../apm';
import { queues } from '../redis-workers/queueWorkers';
import { processAnalyticsBatch } from '../redis-workers/analyticsBatchInsertWorker';

// Batch configuration
const BATCH_INTERVAL_MS = 3000; // 3 seconds
const MAX_BATCH_SIZE = 6000; // Maximum items in a batch

export class AnalyticsBatcher {
  private static instance: AnalyticsBatcher;
  // Simple structure: table name -> data array
  private batches: Record<string, any[]> = {};
  private isFlushInProgress: boolean = false;

  private constructor() {
    setInterval(() => this.flush(), BATCH_INTERVAL_MS);
  }

  static getInstance(): AnalyticsBatcher {
    if (!AnalyticsBatcher.instance) {
      AnalyticsBatcher.instance = new AnalyticsBatcher();
    }
    return AnalyticsBatcher.instance;
  }

  async addToBatch(table: string, items: any[]): Promise<void> {
    if (!this.batches[table]) {
      this.batches[table] = [];
    }

    this.batches[table].push(...items);

    // Flush immediately if batch size exceeds limit
    if (this.batches[table].length >= MAX_BATCH_SIZE) {
      await this.flush(table);
    }
  }

  public async flush(specificTable?: string): Promise<void> {
    if (this.isFlushInProgress) return;
    this.isFlushInProgress = true;

    try {
      const tablesToProcess = specificTable
        ? [specificTable]
        : Object.keys(this.batches);

      for (const table of tablesToProcess) {
        const data = this.batches[table];
        if (!data?.length) continue;

        const dataToSend = [...data];
        this.batches[table] = []; // Clear the batch

        try {
          await this.attemptInsert(table, dataToSend);
        } catch (err: any) {
          logger.error({
            message: `First attempt of analytics batch insert job addition failed: ${err.message}`,
            table,
            batchSize: dataToSend.length,
          });

          try {
            await this.attemptInsert(table, dataToSend);
          } catch (retryErr: any) {
            logger.error({
              message: `Retry failed for analytics batch insert job addition: ${retryErr.message}`,
              table,
              batchSize: dataToSend.length,
            });
          }
        }
      }
    } finally {
      this.isFlushInProgress = false;
    }
  }

  private async attemptInsert(table: string, dataToSend: any[]): Promise<void> {
    const queue = queues['analyticsBatchInsertQueue'];

    if (!queue) {
      await this.directInsert(table, dataToSend);
      return;
    }

    await queue.add('analyticsBatchInsertJob', {
      data: {
        table,
        insertArray: dataToSend,
      },
    });
    logger.info({
      message: `Successfully added batch insert job to queue`,
      table,
      count: dataToSend.length,
    });
  }

  private async directInsert(table: string, dataToSend: any[]): Promise<void> {
    logger.info({
      message: 'Analytics insert directly',
      table,
      count: dataToSend.length,
    });
    const result = await processAnalyticsBatch(table, dataToSend);

    if (!result) {
      logger.error({
        message: 'Direct insert failed',
        table,
        count: dataToSend.length,
      });
    }
  }
}
