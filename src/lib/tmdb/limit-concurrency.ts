/**
 * p-limit style gate: at most `max` wrapped calls run at once, the rest wait FIFO.
 * A finishing call hands its slot straight to the next waiter, so the count never overshoots.
 */
export function createLimiter(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error(`createLimiter: max must be a positive integer, got ${max}`);
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiters.push(resolve));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiters.shift();
      if (next) next();
      else active--;
    }
  };
}
