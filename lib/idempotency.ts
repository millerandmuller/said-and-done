// "Try again" after a failed or slow checkout must not create a second invoice for the same sale.
// Best effort: the map lives in one serverless instance; the client also reuses the key until the sale changes.
const TTL_MS = 10 * 60_000;
const done = new Map<string, { at: number; value: Promise<unknown> }>();

export function once<T>(key: string | undefined, work: () => Promise<T>): Promise<T> {
  if (!key) return work();
  const now = Date.now();
  for (const [k, v] of done) if (now - v.at > TTL_MS) done.delete(k);
  const hit = done.get(key);
  if (hit) return hit.value as Promise<T>;
  const value = work();
  done.set(key, { at: now, value });
  value.catch(() => done.delete(key)); // a failed attempt may be retried with the same key
  return value;
}
