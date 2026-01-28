export interface BatchResult<T, R> {
  successful: Array<{ item: T; result: R }>;
  failed: Array<{ item: T; error: unknown }>;
}

/**
 * Process an array of items in batches, executing an async function on each item
 * @param items - Array of items to process
 * @param processor - Async function to execute on each item
 * @param batchSize - Number of items to process concurrently (default: 10)
 * @returns Object containing successful and failed items
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<BatchResult<T, R>> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('batchSize must be a positive integer');
  }
  const successful: Array<{ item: T; result: R }> = [];
  const failed: Array<{ item: T; error: unknown }> = [];

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
  }

  return { successful, failed };
}
