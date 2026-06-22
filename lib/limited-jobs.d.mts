export type LimitedJobSuccess<T> = {
  success: true;
  value: T;
};

export type LimitedJobFailure = {
  success: false;
  error: string;
};

export type LimitedJobResult<T> = LimitedJobSuccess<T> | LimitedJobFailure;

export type LimitedJobProgress<T> = {
  completed: number;
  total: number;
  index: number;
  result: LimitedJobResult<T>;
};

export type LimitedJobOptions<T> = {
  concurrency?: number;
  onProgress?: (progress: LimitedJobProgress<T>) => void;
};

export type RetryOptions = {
  retries?: number;
  delayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export function normalizeConcurrency(value: unknown, fallback?: number): number;
export function getErrorMessage(error: unknown): string;
export function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: RetryOptions
): Promise<T>;
export function runLimitedJobs<TItem, TResult>(
  items: TItem[],
  worker: (item: TItem, index: number) => Promise<TResult>,
  options?: LimitedJobOptions<TResult>
): Promise<LimitedJobResult<TResult>[]>;
