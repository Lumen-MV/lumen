/**
 * One ffmpeg extraction at a time per process (each streams a whole release — up to 8 GB — through the VM);
 * further requests wait in FIFO order. HMR-safe via globalThis. A failing task never breaks the chain.
 */
type Queue = { tail: Promise<unknown>; waiting: number };
const g = globalThis as unknown as { __hcFfmpegQueue?: Queue };
const queue = (): Queue => (g.__hcFfmpegQueue ??= { tail: Promise.resolve(), waiting: 0 });

export function enqueueFfmpeg<T>(task: () => Promise<T>): Promise<T> {
  const q = queue();
  q.waiting++;
  const run = q.tail.then(async () => {
    q.waiting--;
    return task();
  });
  q.tail = run.catch(() => undefined);
  return run;
}

/** Tasks still waiting for their turn (the running one excluded). */
export const ffmpegQueueLength = (): number => queue().waiting;
