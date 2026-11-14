import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { chunks, pool, readAllPages } = await import("./batch");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("database batching (same rows, less waiting)", () => {
  it("chunks keep every row, in order", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 500)).toEqual([]);
  });

  it("pool runs every item, at most `limit` at once, results in input order", async () => {
    let now = 0, max = 0;
    const out = await pool([5, 1, 4, 2, 3, 0], async (x) => {
      max = Math.max(max, ++now);
      await wait(x * 3);
      now--;
      return x * 10;
    }, 3);
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(max).toBe(3);
  });

  it("pool stops starting new batches after an error, and throws it", async () => {
    const started: number[] = [];
    await expect(
      pool([0, 1, 2, 3, 4, 5, 6, 7], async (x) => {
        started.push(x);
        await wait(2);
        if (x === 1) throw new Error("batch 1 failed");
        return x;
      }, 2),
    ).rejects.toThrow("batch 1 failed");
    expect(started.length).toBeLessThan(8);
  });

  it("readAllPages returns every row across pages, in order", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
    const page = vi.fn(async (from: number, to: number, withCount: boolean) => ({
      data: rows.slice(from, to + 1),
      error: null,
      count: withCount ? rows.length : null,
    }));
    expect(await readAllPages(page)).toEqual(rows);
    expect(page).toHaveBeenCalledTimes(3);
    // Small results: one request.
    page.mockClear();
    expect(await readAllPages(async (f, t, c) => page(f, t, c).then((r) => ({ ...r, data: r.data!.slice(0, 10) })))).toHaveLength(10);
  });
});
