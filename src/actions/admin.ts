"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { parties, states, users } from "@/lib/db/schema";
import { AuthzError, requireRole } from "@/lib/authz";
import { tags } from "@/lib/cache";
import { pickPartyColor, PLACEHOLDER_GRAY } from "@/lib/party-colors";

/** Party colors appear on nearly every cached page — bust the long-lived ones. */
async function revalidatePartyVisuals() {
  updateTag(tags.mapData);
  const stateRows = await db.select({ id: states.id }).from(states);
  for (const s of stateRows) updateTag(tags.state(s.id));
}

export async function updatePartyAction(formData: FormData): Promise<void> {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/admin/parties");
    throw e;
  }

  const partyId = String(formData.get("partyId") ?? "");
  const color = String(formData.get("color") ?? "").trim();
  const abbreviation = String(formData.get("abbreviation") ?? "").trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(color)) redirect("/admin/parties?error=bad_color");

  await db
    .update(parties)
    .set({ color, abbreviation: abbreviation || null })
    .where(eq(parties.id, partyId));

  await revalidatePartyVisuals();
  redirect("/admin/parties?done=1");
}

/** One-click fix for archives whose imported parties are all placeholder gray. */
export async function autoColorPartiesAction(): Promise<void> {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/admin/parties");
    throw e;
  }

  const gray = await db.query.parties.findMany({ where: eq(parties.color, PLACEHOLDER_GRAY) });
  const { canonicalParty } = await import("@/lib/import/canonical-party-colors");
  let changed = 0;
  for (const p of gray) {
    if (p.isPseudo) continue; // Independent/Others stay neutral gray by design
    const canonical = canonicalParty(p.name);
    await db
      .update(parties)
      .set({
        color: canonical?.color ?? pickPartyColor(p.id),
        abbreviation: p.abbreviation ?? canonical?.abbreviation ?? null,
      })
      .where(eq(parties.id, p.id));
    changed++;
  }
  if (changed > 0) await revalidatePartyVisuals();
  redirect(`/admin/parties?done=${changed}`);
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  let admin;
  try {
    admin = await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/admin/users");
    throw e;
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!["contributor", "moderator", "admin"].includes(role)) {
    redirect("/admin/users?error=bad_role");
  }
  // Admins cannot change their own role — prevents accidental lockout.
  if (userId === admin.id) {
    redirect("/admin/users?error=self");
  }

  await db
    .update(users)
    .set({ role: role as "contributor" | "moderator" | "admin" })
    .where(eq(users.id, userId));

  redirect("/admin/users?done=1");
}
