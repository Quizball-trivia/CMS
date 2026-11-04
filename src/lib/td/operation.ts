import { t } from '@/lib/td/i18n';
import { SESSION_CHANGED, TdApiError, type TdRequestOptions } from './api-client';

/**
 * One user action (a save, a bulk approve, a publish) bound to the sign-in it
 * started under: every request it makes, retries included, carries that
 * generation, so none of them can run under another account signed in
 * meanwhile (in this tab or another).
 */
export interface TdOperation extends TdRequestOptions {
  generation: string | null;
}

interface SessionReader {
  read(): { generation: string } | null;
}

export function beginOperation(tokens: SessionReader): TdOperation {
  return { generation: tokens.read()?.generation ?? null };
}

export function operationIsCurrent(tokens: SessionReader, operation: TdOperation): boolean {
  return (tokens.read()?.generation ?? null) === operation.generation;
}

const sessionChanged = () => new TdApiError(0, SESSION_CHANGED, t('The session changed; the request was cancelled'));

/** The contract's `conflict_retry` means "send the same request again"; nothing else is retried. */
export async function retryConflicts<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof TdApiError && error.code === 'conflict_retry') || attempt >= attempts) throw error;
    }
  }
}

export type TdEachResult<T, R> = { item: T; ok: true; value: R } | { item: T; ok: false; error: unknown };

/**
 * Runs `fn` over `items` one after another (each at its own version), all
 * under `operation`. A changed session stops the run: the rest are reported
 * as cancelled, never sent.
 */
export async function runEach<T, R>(
  tokens: SessionReader,
  operation: TdOperation,
  items: readonly T[],
  fn: (item: T) => Promise<R>,
): Promise<TdEachResult<T, R>[]> {
  const results: TdEachResult<T, R>[] = [];
  let stopped = false;
  for (const item of items) {
    if (stopped || !operationIsCurrent(tokens, operation)) {
      stopped = true;
      results.push({ item, ok: false, error: sessionChanged() });
      continue;
    }
    try {
      results.push({ item, ok: true, value: await retryConflicts(() => fn(item)) });
    } catch (error) {
      if (error instanceof TdApiError && error.code === SESSION_CHANGED) stopped = true;
      results.push({ item, ok: false, error });
    }
  }
  return results;
}
