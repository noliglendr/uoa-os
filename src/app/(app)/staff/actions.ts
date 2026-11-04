"use server";

// Staff accounts (D4). The principal or an administrator adds people and
// changes roles; only the principal gives or changes the Principal and
// Attorney roles (decision #16, also enforced in the database).
// A new person gets a one-time temporary password from the principal, signs
// in, sets up the authenticator app (MFA), then changes the password on the
// Account page.

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["principal", "attorney", "paralegal", "docketing", "intake", "administrator"];
const LEGAL_ROLES = ["principal", "attorney"];

export type CreateStaffState = { error?: string; created?: { email: string; password: string } } | null;

/** The signed-in principal or administrator, or null. */
async function requireManager() {
  const db = await createClient();
  const { data: role } = await db.rpc("current_app_role");
  return role === "principal" || role === "administrator" ? { db, principal: role === "principal" } : null;
}

export async function createStaff(_prev: CreateStaffState, form: FormData): Promise<CreateStaffState> {
  const manager = await requireManager();
  if (!manager) return { error: "Only the principal or an administrator can add staff." };
  const { db } = manager;

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("display_name") ?? "").trim();
  const role = String(form.get("role") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid work email." };
  if (!name) return { error: "Enter the person's name." };
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (LEGAL_ROLES.includes(role) && !manager.principal) return { error: "Only the principal can add a Principal or an Attorney." };

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
  const manager = await requireManager();
  const id = String(form.get("profile_id") ?? "");
  let message: string | null = null;
  if (!manager) {
    message = "Only the principal or an administrator can change staff.";
  } else {
    const { db } = manager;
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

// ---------------------------------------------------------------------------
// Edit a staff member (decision #18): name, a new temporary password, and a
// reset of two-step sign-in (new or lost phone). Same limits as roles: not
// yourself, and the Principal and Attorneys only by the principal.
// ---------------------------------------------------------------------------

type Target = { db: Awaited<ReturnType<typeof createClient>>; id: string; name: string } | { error: string };

/** Checks the caller may edit this person, and returns who it is. */
async function editable(form: FormData): Promise<Target> {
  const manager = await requireManager();
  if (!manager) return { error: "Only the principal or an administrator can change staff." };
  const id = String(form.get("profile_id") ?? "");
  const { data: claims } = await manager.db.auth.getClaims();
  if (id === claims?.claims.sub) return { error: "Use the Account page to change your own details." };
  const { data: person } = await manager.db.from("profiles").select("id, display_name, role").eq("id", id).maybeSingle();
  if (!person) return { error: "That person was not found." };
  if (LEGAL_ROLES.includes(person.role) && !manager.principal) {
    return { error: "Only the principal can change the Principal or an Attorney." };
  }
  return { db: manager.db, id: person.id, name: person.display_name };
}

export type EditStaffState = { error?: string; ok?: string; password?: string } | null;

export async function renameStaff(_prev: EditStaffState, form: FormData): Promise<EditStaffState> {
  const target = await editable(form);
  if ("error" in target) return { error: target.error };
  const name = String(form.get("display_name") ?? "").trim();
  if (!name) return { error: "Enter the person's name." };
  if (name === target.name) return { ok: "No change." };
  const { error } = await target.db.from("profiles").update({ display_name: name }).eq("id", target.id);
  if (error) return { error: error.message };
  revalidatePath("/staff");
  return { ok: `Name changed to ${name}.` };
}

export async function resetStaffPassword(_prev: EditStaffState, form: FormData): Promise<EditStaffState> {
  const target = await editable(form);
  if ("error" in target) return { error: target.error };
  const password = crypto.randomBytes(12).toString("base64url");
  const { error } = await createAdminClient().auth.admin.updateUserById(target.id, { password });
  if (error) return { error: error.message };
  await target.db.rpc("log_event", { p_event_type: "user.password_reset", p_entity_type: "profile", p_entity_id: target.id, p_payload: {} });
  return { ok: `New temporary password for ${target.name}.`, password };
}

export async function resetStaffTwoStep(_prev: EditStaffState, form: FormData): Promise<EditStaffState> {
  const target = await editable(form);
  if ("error" in target) return { error: target.error };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: target.id });
  if (error) return { error: error.message };
  for (const factor of data?.factors ?? []) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ userId: target.id, id: factor.id });
    if (deleteError) return { error: deleteError.message };
  }
  await target.db.rpc("log_event", {
    p_event_type: "user.mfa_reset",
    p_entity_type: "profile",
    p_entity_id: target.id,
    p_payload: { factors_removed: data?.factors.length ?? 0 },
  });
  revalidatePath("/staff");
  return { ok: `Two-step sign-in reset. ${target.name} scans a new QR code at the next sign-in.` };
}

/** Switch someone's access off or on, with the result shown on their row. */
export async function setStaffAccess(_prev: EditStaffState, form: FormData): Promise<EditStaffState> {
  const target = await editable(form);
  if ("error" in target) return { error: target.error };
  const active = form.get("active") === "true";
  const { data, error } = await target.db.from("profiles").update({ active }).eq("id", target.id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Not saved: you don't have permission to change this person." };
  revalidatePath("/staff");
  return { ok: active ? "Access switched on." : "Access switched off." };
}

/**
 * Remove someone who never used the system (decision #19). The database
 * refuses if they have any activity; then access is switched off instead.
 */
export async function removeStaff(_prev: EditStaffState, form: FormData): Promise<EditStaffState> {
  const target = await editable(form);
  if ("error" in target) return { error: target.error };
  const { error } = await target.db.rpc("remove_staff", { p_profile: target.id });
  if (error) return { error: error.message };
  // The workflow record is gone; now the login itself.
  const { error: authError } = await createAdminClient().auth.admin.deleteUser(target.id);
  if (authError) return { error: `Removed from the staff list, but the login could not be deleted: ${authError.message}` };
  revalidatePath("/staff");
  return { ok: `${target.name} was removed.` };
}
