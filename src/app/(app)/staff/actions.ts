"use server";

// Staff accounts (D4). Only the principal adds people or changes roles.
// A new person gets a one-time temporary password from the principal, signs
// in, sets up the authenticator app (MFA), then changes the password on the
// Account page.

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["principal", "attorney", "paralegal", "docketing", "intake"];

export type CreateStaffState = { error?: string; created?: { email: string; password: string } } | null;

async function requirePrincipal() {
  const db = await createClient();
  const { data: role } = await db.rpc("current_app_role");
  return role === "principal" ? db : null;
}

export async function createStaff(_prev: CreateStaffState, form: FormData): Promise<CreateStaffState> {
  const db = await requirePrincipal();
  if (!db) return { error: "Only the principal can add staff." };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("display_name") ?? "").trim();
  const role = String(form.get("role") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid work email." };
  if (!name) return { error: "Enter the person's name." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };

  const password = crypto.randomBytes(12).toString("base64url");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message.includes("already") ? "That email already has an account." : error.message };

  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, display_name: name, role });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: profileError.message };
  }
  await db.rpc("log_event", {
    p_event_type: "user.invited",
    p_entity_type: "profile",
    p_entity_id: data.user.id,
    p_payload: { role },
  });
  revalidatePath("/staff");
  return { created: { email, password } };
}

export async function updateStaff(form: FormData) {
  const db = await requirePrincipal();
  const id = String(form.get("profile_id") ?? "");
  let message: string | null = null;
  if (!db) {
    message = "Only the principal can change staff.";
  } else {
    const { data: claims } = await db.auth.getClaims();
    const change: Record<string, unknown> = {};
    const role = form.get("role");
    if (role !== null) change.role = String(role);
    const active = form.get("active");
    if (active !== null) change.active = active === "true";
    if (id === claims?.claims.sub) {
      message = "You can't change your own role or switch off your own access.";
    } else {
      const { error } = await db.from("profiles").update(change).eq("id", id);
      if (error) message = error.message;
    }
  }
  revalidatePath("/staff");
  redirect(message ? `/staff?error=${encodeURIComponent(message)}` : "/staff");
}
