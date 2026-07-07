export function attachRateLimitHeaders(res, result) {
  const resetSeconds = Math.ceil(result.resetMs / 1000);

  res.setHeader('RateLimit-Limit', String(result.limit));
  res.setHeader('RateLimit-Remaining', String(result.remaining));
  res.setHeader('RateLimit-Reset', String(resetSeconds));

  // Legacy compatibility. Many API clients still expect these.
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));

  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, resetSeconds)));
  }
}