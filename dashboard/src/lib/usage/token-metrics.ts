export function getUncachedInputTokens(
  inputTokens: number,
  cachedTokens: number,
): number {
  return Math.max(0, inputTokens - cachedTokens);
}

export function getCacheRate(
  inputTokens: number,
  cachedTokens: number,
): number {
  return inputTokens > 0 ? cachedTokens / inputTokens : 0;
}
