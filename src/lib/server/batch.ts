import "server-only";
// Database batching for the agent's writes and reads. Same rows, same queries: only the waiting changes
// (batches run a few at a time instead of strictly one after another; pages of a read come in parallel).

/** How many batches go to the database at once. */
export const DB_CONCURRENCY = 6;

/** Run fn over items, at most `limit` at a time; results in input order. The first error is thrown. */
export async function pool<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, limit = DB_CONCURRENCY): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    // After a failure no new batch starts (like the old one-at-a-time loop, which stopped at the first error).
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Split rows into chunks of `size`. */
export function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < rows.length; k += size) out.push(rows.slice(k, k + size));
  return out;
}

type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Every row of an ordered, paginated read. The first page asks for the exact count; the remaining pages
 * are fetched in parallel. `page(from, to, withCount)` builds the query for one range.
 */
export async function readAllPages<T>(page: (from: number, to: number, withCount: boolean) => PromiseLike<Page<T>>, size = 1000): Promise<T[]> {
  const first = await page(0, size - 1, true);
  if (first.error) throw new Error(first.error.message);
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length < size || total <= size) return rows;
  const starts: number[] = [];
  for (let from = size; from < total; from += size) starts.push(from);
  const rest = await pool(starts, async (from) => {
    const r = await page(from, from + size - 1, false);
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  });
  for (const r of rest) rows.push(...r);
  return rows;
}
