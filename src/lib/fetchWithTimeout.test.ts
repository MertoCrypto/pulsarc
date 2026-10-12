/**
 * Tests for fetchWithTimeout.
 * Run with: node --experimental-strip-types src/lib/fetchWithTimeout.test.ts
 */
import assert from 'node:assert/strict';
import { fetchWithTimeout } from './fetchWithTimeout.ts';

let passed = 0;

function pass(name: string): void {
  console.log(`  PASS  ${name}`);
  passed++;
}

// ---------------------------------------------------------------------------
// 1. Resolves with the response when the fake answers fast
// ---------------------------------------------------------------------------
{
  const fakeResponse = new Response('ok', { status: 200 });
  const fakeFetch: typeof fetch = async (_input, _init) => fakeResponse;

  const result = await fetchWithTimeout('https://example.com', undefined, 1000, fakeFetch);
  assert.strictEqual(result, fakeResponse);
  pass('resolves with the response when the fake answers fast');
}

// ---------------------------------------------------------------------------
// 2. Rejects with name "TimeoutError" and the exact message on timeout
// ---------------------------------------------------------------------------
{
  const timeoutMs = 30;

  // Fake that parks until aborted, then rejects with an AbortError.
  const fakeFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });

  let caughtErr: Error | null = null;
  try {
    await fetchWithTimeout('https://example.com', undefined, timeoutMs, fakeFetch);
  } catch (e) {
    caughtErr = e as Error;
  }

  assert.ok(caughtErr !== null, 'should have rejected');
  assert.strictEqual(caughtErr.name, 'TimeoutError');
  assert.strictEqual(caughtErr.message, `Request timed out after ${timeoutMs} ms`);
  pass('rejects with name "TimeoutError" and exact message on timeout');
}

// ---------------------------------------------------------------------------
// 3. Passes through the init object (method / headers) to the fake
// ---------------------------------------------------------------------------
{
  let capturedInit: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedInit = init;
    return new Response('ok');
  };

  const init: RequestInit = {
    method: 'POST',
    headers: { 'x-custom': 'pulsarc' },
    body: 'payload',
  };

  await fetchWithTimeout('https://example.com', init, 1000, fakeFetch);

  assert.ok(capturedInit !== undefined);
  assert.strictEqual(capturedInit.method, 'POST');
  assert.deepEqual(capturedInit.headers, { 'x-custom': 'pulsarc' });
  assert.strictEqual(capturedInit.body, 'payload');
  pass('passes through init object (method/headers) to the fake');
}

// ---------------------------------------------------------------------------
// 4. Caller signal abort: request is aborted and rejection is NOT a TimeoutError
// ---------------------------------------------------------------------------
{
  const callerController = new AbortController();

  const fakeFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted by caller', 'AbortError'));
      });
    });

  let caughtErr: Error | null = null;
  const promise = fetchWithTimeout(
    'https://example.com',
    { signal: callerController.signal },
    5000,
    fakeFetch,
  );

  // Abort the caller's signal after a short delay.
  setTimeout(() => callerController.abort(), 10);

  try {
    await promise;
  } catch (e) {
    caughtErr = e as Error;
  }

  assert.ok(caughtErr !== null, 'should have rejected');
  assert.notStrictEqual(caughtErr.name, 'TimeoutError', 'must not be a TimeoutError');
  pass('caller signal abort: rejection is NOT a TimeoutError');
}

// ---------------------------------------------------------------------------
// 5. Already-aborted caller signal rejects without calling the fake
// ---------------------------------------------------------------------------
{
  let fakeCalled = false;
  const fakeFetch: typeof fetch = async () => {
    fakeCalled = true;
    return new Response('ok');
  };

  const callerController = new AbortController();
  callerController.abort();

  let caughtErr: Error | null = null;
  try {
    await fetchWithTimeout(
      'https://example.com',
      { signal: callerController.signal },
      1000,
      fakeFetch,
    );
  } catch (e) {
    caughtErr = e as Error;
  }

  assert.ok(caughtErr !== null, 'should have rejected');
  assert.strictEqual(fakeCalled, false, 'fake must not have been called');
  pass('already-aborted caller signal rejects without calling the fake');
}

// ---------------------------------------------------------------------------
// 6. A fake that throws TypeError("network") is rethrown unchanged
// ---------------------------------------------------------------------------
{
  const networkErr = new TypeError('network');
  const fakeFetch: typeof fetch = async () => { throw networkErr; };

  let caughtErr: unknown = null;
  try {
    await fetchWithTimeout('https://example.com', undefined, 1000, fakeFetch);
  } catch (e) {
    caughtErr = e;
  }

  assert.strictEqual(caughtErr, networkErr);
  pass('TypeError("network") is rethrown unchanged');
}

// ---------------------------------------------------------------------------
// 7. Timer is cleared after success — no spurious abort after the response
// ---------------------------------------------------------------------------
{
  // Give a 40 ms timeout but answer immediately.
  // Wait 80 ms after resolution, then check the fake's signal was NOT aborted.
  let capturedSignal = null as AbortSignal | null;

  const fakeFetch: typeof fetch = async (_input, init) => {
    capturedSignal = init?.signal ?? null;
    return new Response('fast');
  };

  await fetchWithTimeout('https://example.com', undefined, 40, fakeFetch);

  // Wait longer than the timeout to confirm the timer was cleared.
  await new Promise<void>((resolve) => setTimeout(resolve, 80));

  assert.ok(capturedSignal !== null, 'signal should have been passed to fake');
  assert.strictEqual(
    (capturedSignal as AbortSignal).aborted,
    false,
    'signal must NOT be aborted after a clean response',
  );
  pass('timer is cleared after success (no spurious abort)');
}

// ---------------------------------------------------------------------------
console.log(`\n${passed}/7 tests passed`);
