import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchWithRetry } from "./fetch";

// Service-role client: bypasses row-level security. Server only, and only for
// system jobs (reminders) and steps the principal is allowed to do but the
// user session can't (creating staff logins). Check the caller's role first.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithRetry },
  });
}
