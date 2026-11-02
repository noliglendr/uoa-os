import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  principal: "Principal",
  attorney: "Attorney",
  paralegal: "Paralegal",
  docketing: "Docketing",
  intake: "Intake",
};

// Placeholder home page. The principal dashboard replaces it after Gate 2 approval.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 p-6">
      <h1 className="text-2xl font-semibold">UOA OS</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <CurrentUser />
      </Suspense>
    </main>
  );
}

async function CurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // Row-level security returns no profile unless the user is active and MFA-verified.
  const { data: profile } = userId
    ? await supabase.from("profiles").select("display_name, role").eq("id", userId).maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      {profile ? (
        <p>
          Signed in as <strong>{profile.display_name}</strong> ({ROLE_LABELS[profile.role] ?? profile.role}).
        </p>
      ) : (
        <p role="alert" className="text-red-600">
          Your account has no active role. Ask the principal to set up your access.
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className="text-sm text-zinc-500 underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
