import { createBrowserClient } from "@supabase/ssr";
import { fetchWithRetry } from "./fetch";

// Supabase client for Client Components (runs in the browser). Same 20-second
// limit and connection retry as the server, so a dropped connection can't
// leave a button spinning forever.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithRetry } },
  );
}

/** Gives up on a sign-in step after `ms`, so the button can be used again. */
export function withTimeout<T>(promise: Promise<T>, ms = 20_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export const NETWORK_MESSAGE = "Couldn't reach the server. Check your internet connection and try again.";
