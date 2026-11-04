import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Staff = {
  id: string;
  displayName: string;
  role: "principal" | "attorney" | "paralegal" | "docketing" | "intake";
};

/**
 * The signed-in staff member, or a redirect to login. RLS hides everything else.
 * Cached per request, so the layout and the page share one lookup.
 */
export const requireStaff = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle();

  const staff: Staff | null = profile
    ? { id: profile.id, displayName: profile.display_name, role: profile.role }
    : null;
  return { supabase, staff };
});

export function isAttorney(staff: Staff | null): boolean {
  return staff?.role === "attorney" || staff?.role === "principal";
}
