"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { parties, states, users } from "@/lib/db/schema";
import { AuthzError, requireRole } from "@/lib/authz";
import { tags } from "@/lib/cache";
import { pickPartyColor, PLACEHOLDER_GRAY } from "@/lib/party-colors";

/**
 * Bump every long-lived tag: the landing map's data and each state's page
 * (the Union page lives on state 'in'). Party colours appear on nearly every
 * cached page, which is why the colour actions call this; it is also the only
 * thing that refreshes those pages after a bulk insert run from a terminal,
 * because such an insert bumps no tag and a redeploy does not clear
 * unstable_cache. Returns how many state tags were bumped.
 */
async function revalidatePartyVisuals(): Promise<number> {
  updateTag(tags.mapData);
  const stateRows = await db.select({ id: states.id }).from(states);
  for (const s of stateRows) updateTag(tags.state(s.id));
  return stateRows.length;
}

/**
 * The post-insert step from docs/PRODUCTION_RUNBOOK.md: after a bulk insert,
 * an admin presses this once and the tag-cached pages regenerate on their next
 * request. It writes nothing and reads only the state list, so there is no
 * revision to record; it is an operational act, not a change to the record.
 */
export async function refreshCachedPagesAction(): Promise<void> {
  try {
    await requireRole("admin");
  } catch (e) {
    if (e instanceof AuthzError) redirect("/login?next=/admin/import");
    throw e;
  }
  const bumped = await revalidatePartyVisuals();
  redirect(`/admin/import?refreshed=${bumped}`);
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
