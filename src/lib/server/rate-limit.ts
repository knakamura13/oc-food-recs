type Bucket = number[];

const buckets = new Map<string, Bucket>();

export function allowRequest(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
  now = Date.now(),
): boolean {
  const recent = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

/** Test-only: clear in-memory windows between cases. */
export function resetRateLimitForTests(): void {
  buckets.clear();
}
