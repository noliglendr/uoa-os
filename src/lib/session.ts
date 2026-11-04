import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Staff = {
  id: string;
  displayName: string;
  role: "principal" | "attorney" | "paralegal" | "docketing" | "intake" | "administrator";
};

/**
 * The signed-in staff member, or a redirect to login. RLS hides everything else.
 * Cached per request, so the layout and the page share one lookup.
 */
export const requireStaff = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  const email = (data?.claims.email as string | undefined) ?? null;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", userId)
    .maybeSingle();

  const staff: Staff | null = profile
    ? { id: profile.id, displayName: profile.display_name, role: profile.role }
    : null;
  return { supabase, staff, email };
});

/** Principal or administrator: manages staff and settings (approves nothing unless principal). */
export function canManage(staff: Staff | null): boolean {
  return staff?.role === "principal" || staff?.role === "administrator";
}

/** Roles only the principal can give, change or remove (decision #16). */
export const LEGAL_ROLES = ["principal", "attorney"];

export function isAttorney(staff: Staff | null): boolean {
  return staff?.role === "attorney" || staff?.role === "principal";
}
