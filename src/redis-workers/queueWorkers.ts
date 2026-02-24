import { Queue, Worker } from 'bullmq';
import { queueConfigs } from './config';

export const queues: { [key: string]: Queue } = {};

export const initializeQueuesAndWorkers = async () => {
  for (const config of queueConfigs) {
    try {
      const queue = new Queue(config.name, config.options);
      queues[config.name] = queue;

      const worker = new Worker(
        config.name,
        config.processor,
        config.workerOptions ? config.workerOptions : config.options
      );

      worker.on('completed', (job) => {
        console.log(`Job ${job.id} completed in queue ${config.name}`);
      });

      worker.on('failed', (job, err) => {
        console.error(
          `Job ${job?.id} failed in queue ${config.name} with error:`,
          err
        );
      });

      if (config.cronJob) {
        await queue.add(config.cronJob.name, config.cronJob.data || {}, {
          repeat: {
            pattern: config.cronJob.pattern,
          },
        });
      }
    } catch (error) {
      console.error(`Error initializing queue ${config.name}:`, error);
    }
  }
};
