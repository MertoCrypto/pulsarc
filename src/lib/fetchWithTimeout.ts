/**
 * Fetch wrapper that aborts the request after `timeoutMs` milliseconds.
 *
 * - Clears the timer as soon as response headers arrive or the call fails.
 * - If the caller supplies `init.signal` and it is already aborted, rejects
 *   immediately without calling `fetchFn`.
 * - If the caller's signal aborts mid-flight, the request is aborted and the
 *   rejection propagates unchanged (not wrapped as a TimeoutError).
 * - On timeout, rejects with an Error whose `name` is `'TimeoutError'` and
 *   whose `message` is `Request timed out after ${timeoutMs} ms`.
 * - Any other failure from `fetchFn` is rethrown unchanged.
 */
export function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs = 15000,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const callerSignal = init?.signal ?? null;

  // Reject immediately if the caller's signal is already aborted.
  if (callerSignal !== null && callerSignal.aborted) {
    return Promise.reject(callerSignal.reason ?? new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<Response>((resolve, reject) => {
    const controller = new AbortController();
    let timedOut = false;

    // Wire the caller's signal into our controller so aborting it also aborts
    // the fetch, but we keep the original rejection reason (not a TimeoutError).
    let callerAbortHandler: (() => void) | null = null;
    if (callerSignal !== null) {
      callerAbortHandler = () => {
        controller.abort(callerSignal.reason);
      };
      callerSignal.addEventListener('abort', callerAbortHandler);
    }

    const timer = setTimeout(() => {
      timedOut = true;
      const err = new Error(`Request timed out after ${timeoutMs} ms`);
      err.name = 'TimeoutError';
      controller.abort(err);
    }, timeoutMs);

    function cleanup(): void {
      clearTimeout(timer);
      if (callerSignal !== null && callerAbortHandler !== null) {
        callerSignal.removeEventListener('abort', callerAbortHandler);
      }
    }

    fetchFn(input, { ...init, signal: controller.signal }).then(
      (response) => {
        cleanup();
        resolve(response);
      },
      (err: unknown) => {
        cleanup();
        if (timedOut) {
          // The abort was ours — replace the generic AbortError with a TimeoutError.
          const timeoutErr = new Error(`Request timed out after ${timeoutMs} ms`);
          timeoutErr.name = 'TimeoutError';
          reject(timeoutErr);
        } else {
          // Caller signal abort or genuine network error — rethrow unchanged.
          reject(err);
        }
      },
    );
  });
}
