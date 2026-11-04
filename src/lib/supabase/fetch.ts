// fetch for the Supabase clients:
// * every attempt gives up after 20 seconds, so a stalled connection can't
//   leave a page or a button waiting forever;
// * when the connection can't even be opened (a network drop, a DNS hiccup),
//   or a read gets no answer in time, wait a moment and try again, up to 2
//   more times. A save is retried only when the connection itself failed,
//   which means it was never sent; a save that timed out may have reached the
//   database, so it is not sent twice.
// Works in older browsers too (Safari before 17.4 has no AbortSignal.any).

const CONNECT_ERRORS = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);

function connectFailed(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return error instanceof TypeError && CONNECT_ERRORS.has(cause?.code ?? "");
}

/** A signal that aborts after `ms`, or when `outer` aborts. */
function limit(ms: number, outer?: AbortSignal | null): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("The request took too long", "TimeoutError")), ms);
  const onOuter = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener("abort", onOuter, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

export function makeFetchWithRetry(attemptMs = 20_000, base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const read = method === "GET" || method === "HEAD";
    for (let attempt = 0; ; attempt++) {
      const { signal, done } = limit(attemptMs, init?.signal);
      try {
        return await base(input, { ...init, signal });
      } catch (error) {
        const timedOut = signal.aborted && !init?.signal?.aborted;
        const retry = connectFailed(error) || (read && timedOut);
        if (attempt >= 2 || !retry) throw error;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      } finally {
        done();
      }
    }
  };
}

export const fetchWithRetry = makeFetchWithRetry();
