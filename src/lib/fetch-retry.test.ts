import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFetchWithRetry } from "./supabase/fetch.ts";

// The database connection helper: retries only when it is safe, and never hangs.

function connectError() {
  return Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
}

/** A fetch that never answers until its signal aborts. */
const hanging: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));

test("a connection that can't be opened is retried, and succeeds on the third try", async () => {
  let calls = 0;
  const f = makeFetchWithRetry(1000, async () => {
    calls++;
    if (calls < 3) throw connectError();
    return new Response("ok");
  });
  assert.equal(await (await f("https://db.test", { method: "POST" })).text(), "ok");
  assert.equal(calls, 3);
});

test("a drop after the request was sent is not retried (nothing is saved twice)", async () => {
  let calls = 0;
  const f = makeFetchWithRetry(1000, async () => {
    calls++;
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  });
  await assert.rejects(f("https://db.test", { method: "POST" }));
  assert.equal(calls, 1);
});

test("a read with no answer gives up after the time limit, three times, then fails", async () => {
  let calls = 0;
  const f = makeFetchWithRetry(30, (input, init) => {
    calls++;
    return hanging(input, init);
  });
  await assert.rejects(f("https://db.test", { method: "GET" }), { name: "TimeoutError" });
  assert.equal(calls, 3);
});

test("a save with no answer gives up after the time limit and is not sent again", async () => {
  let calls = 0;
  const f = makeFetchWithRetry(30, (input, init) => {
    calls++;
    return hanging(input, init);
  });
  await assert.rejects(f("https://db.test", { method: "POST" }), { name: "TimeoutError" });
  assert.equal(calls, 1);
});

test("a request the caller cancels is not retried", async () => {
  let calls = 0;
  const f = makeFetchWithRetry(1000, (input, init) => {
    calls++;
    return hanging(input, init);
  });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(f("https://db.test", { method: "GET", signal: controller.signal }));
  assert.equal(calls, 1);
});
