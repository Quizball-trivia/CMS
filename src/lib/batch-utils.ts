export interface BatchResult<T, R> {
  successful: Array<{ item: T; result: R }>;
  failed: Array<{ item: T; error: unknown }>;
}

export interface BatchOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  onProgress?: (progress: { completed: number; total: number; successful: number; failed: number }) => void;
}

/**
 * Process an array of items in batches, executing an async function on each item
 * @param items - Array of items to process
 * @param processor - Async function to execute on each item
 * @param options - Batch processing options
 * @returns Object containing successful and failed items
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  optionsOrBatchSize: number | BatchOptions = 10
): Promise<BatchResult<T, R>> {
  const options: BatchOptions = typeof optionsOrBatchSize === 'number'
    ? { batchSize: optionsOrBatchSize }
    : optionsOrBatchSize;

  const { batchSize = 10, delayBetweenBatches = 0, onProgress } = options;

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer');
  }
  const successful: Array<{ item: T; result: R }> = [];
  const failed: Array<{ item: T; error: unknown }> = [];
  const total = items.length;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(item => processor(item))
    );

    results.forEach((result, index) => {
      const item = batch[index];
      if (result.status === 'fulfilled') {
        successful.push({ item, result: result.value });
      } else {
        failed.push({ item, error: result.reason });
      }
    });

    // Report progress after each batch
    if (onProgress) {
      onProgress({
        completed: Math.min(i + batchSize, total),
        total,
        successful: successful.length,
        failed: failed.length,
      });
    }

    // Delay between batches to avoid rate limiting
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return { successful, failed };
}
