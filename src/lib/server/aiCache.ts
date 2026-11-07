import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Two-level cache for Claude results so replays never re-call the API:
 * L1 in-process memory, L2 the Supabase `ai_cache` table (if 002_phase3.sql has been run).
 * Keys hash the exact input, so identical requests (e.g. two homes with the same plan text,
 * or the same home+hour replayed) share one result.
 */
const memory = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();
let tableMissing = false;

export function cacheKey(kind: string, input: unknown): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32)}`;
}

async function readDb<T>(key: string): Promise<T | undefined> {
  const db = getSupabaseAdmin();
  if (!db || tableMissing) return undefined;
  const { data, error } = await db.from("ai_cache").select("value").eq("key", key).maybeSingle();
  if (error) {
    if (error.code === "42P01" || /ai_cache/.test(error.message)) tableMissing = true;
    return undefined;
  }
  return (data?.value as T) ?? undefined;
}

async function writeDb(key: string, value: unknown, model: string) {
  const db = getSupabaseAdmin();
  if (!db || tableMissing) return;
  const { error } = await db.from("ai_cache").upsert({ key, value, model }, { onConflict: "key" });
  if (error && (error.code === "42P01" || /ai_cache/.test(error.message))) tableMissing = true;
}

/** Return the cached value for `key`, or compute it once (concurrent callers share the call). */
export async function cached<T>(key: string, model: string, compute: () => Promise<T>): Promise<T> {
  if (memory.has(key)) return memory.get(key) as T;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const fromDb = await readDb<T>(key);
    if (fromDb !== undefined) {
      memory.set(key, fromDb);
      return fromDb;
    }
    const value = await compute();
    memory.set(key, value);
    await writeDb(key, value, model);
    return value;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
