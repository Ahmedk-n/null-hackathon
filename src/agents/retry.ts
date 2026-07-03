// Guardrail helper (GOAL.md): "every LLM call retries once then falls back to a fixture."
// retryOnce runs `fn`, and on ANY rejection retries exactly once. If the retry also
// rejects, the error propagates so the caller's existing try/catch → replayFixture
// fallback fires. Kept intentionally tiny and dependency-free.
export async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

// Reject after `ms` so a slow multi-turn call (e.g. the tool_runner) can be bounded via
// Promise.race. Server-only; uses setTimeout (no Date.now / timestamp math). The timer is
// unref'd where supported so a pending deadline never keeps the process alive.
export function rejectAfter(ms: number, label: string): Promise<never> {
  return new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms deadline`)), ms);
    (t as { unref?: () => void }).unref?.();
  });
}
