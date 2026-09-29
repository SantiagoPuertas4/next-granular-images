import { describe, expect, it, vi } from 'vitest';
import type { GranularImagesConfig } from '../../src/types/config';

describe('processing queue', () => {
  it('U36 refuses work before init, then caps concurrency', async () => {
    vi.resetModules();
    const queue = await import('../../src/cli/core/queue');
    expect(() => queue.addToQueue(async () => 1)).toThrow('Queue not initialized');

    queue.initializeQueue({ concurrency: 2 } as GranularImagesConfig);
    expect(queue.getQueueStats().concurrency).toBe(2);

    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 5 }, (_, i) =>
      queue.addToQueue(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;
        return i;
      })
    );

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(maxInFlight).toBe(2);
  });
});
