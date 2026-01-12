import PQueue from 'p-queue';
import type { GranularImagesConfig } from '../../types/config';

let processingQueue: PQueue | null = null;

export const initializeQueue = (config: GranularImagesConfig): void => {
  const concurrency = config.concurrency || 4;
  processingQueue = new PQueue({ concurrency });
};

export const getQueue = (): PQueue => {
  if (!processingQueue) {
    throw new Error(
      'Queue not initialized. Call initializeQueue(config) first.'
    );
  }
  return processingQueue;
};

export const addToQueue = <T>(fn: () => Promise<T>): Promise<T> => {
  return getQueue().add(fn) as Promise<T>;
};

export const getQueueStats = () => {
  const queue = getQueue();
  return {
    size: queue.size,
    pending: queue.pending,
    concurrency: queue.concurrency,
  };
};
