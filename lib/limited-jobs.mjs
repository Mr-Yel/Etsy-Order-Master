export function normalizeConcurrency(value, fallback = 4) {
  const concurrency = Number(value);
  if (!Number.isFinite(concurrency) || concurrency < 1) return fallback;
  return Math.floor(concurrency);
}

export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runLimitedJobs(items, worker, options = {}) {
  const total = items.length;
  const concurrency = Math.min(
    normalizeConcurrency(options.concurrency),
    Math.max(total, 1)
  );
  const results = new Array(total);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < total) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = {
          success: true,
          value: await worker(items[index], index),
        };
      } catch (error) {
        results[index] = {
          success: false,
          error: getErrorMessage(error),
        };
      } finally {
        completed += 1;
        options.onProgress?.({
          completed,
          total,
          index,
          result: results[index],
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => runWorker())
  );

  return results;
}
