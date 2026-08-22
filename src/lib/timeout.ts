/**
 * Deadlines for calls that can hang forever.
 *
 * GramJS requests do not always settle when the network drops mid-flight: the
 * promise simply never resolves. Anything driving a repeating loop must put a
 * deadline on such a call, otherwise the loop stops for good.
 */

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Reject with `TimeoutError` if `promise` has not settled within `ms`.
 *
 * The underlying work is NOT cancelled — it is abandoned. That is deliberate:
 * the point is to let the caller move on, not to unwind a stuck socket.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function isTimeoutError(err: unknown): boolean {
  return err instanceof TimeoutError || (err as Error)?.name === "TimeoutError";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
