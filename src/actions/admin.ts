"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AuthzError, requireRole } from "@/lib/authz";

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
