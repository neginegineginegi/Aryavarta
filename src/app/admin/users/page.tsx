import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";

import { setUserRoleAction } from "@/actions/admin";
import { requireRole } from "@/lib/authz";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "User administration" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const admin = await requireRole("admin");
  const { done, error } = await searchParams;
  const rows = await db.query.users.findMany({
    orderBy: [asc(users.createdAt)],
    limit: 500,
  });

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          User administration
        </h1>
        <p className="mt-1 flex gap-4 text-[0.82rem]">
          <Link href="/admin/import" className="text-accent underline-offset-2 hover:underline">
            → Import reference data
          </Link>
          <Link href="/admin/parties" className="text-accent underline-offset-2 hover:underline">
            → Party colors &amp; abbreviations
          </Link>
        </p>
        <p className="mt-2 text-[0.88rem] text-ink-muted">
          Promote trusted contributors to moderator; moderators review submissions and resolve
          disputes. Role changes take effect immediately.
        </p>
        {done && (
          <p className="mt-3 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-[0.85rem] text-approved">
            Role updated.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[0.85rem] text-danger">
            {error === "self" ? "You cannot change your own role." : "Invalid role."}
          </p>
        )}
      </header>

      <table className="mt-6 w-full text-left text-[0.88rem]">
        <thead>
          <tr className="border-b border-rule-dark text-[0.72rem] uppercase tracking-wider text-ink-faint">
            <th className="py-2 pr-4 font-medium">User</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Joined</th>
            <th className="py-2 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-rule align-baseline">
              <td className="py-2.5 pr-4">
                <Link href={`/user/${u.id}`} className="text-accent underline-offset-2 hover:underline">
                  {u.name ?? "—"}
                </Link>
              </td>
              <td className="py-2.5 pr-4 text-ink-muted">{u.email}</td>
              <td className="py-2.5 pr-4 tabular-nums text-ink-faint">
                {u.createdAt.toISOString().slice(0, 10)}
              </td>
              <td className="py-2.5">
                {u.id === admin.id ? (
                  <span className="text-ink-muted">{u.role} (you)</span>
                ) : (
                  <form action={setUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="rounded-sm border border-rule-dark bg-paper-raised px-2 py-1 text-[0.82rem]"
                    >
                      <option value="contributor">contributor</option>
                      <option value="moderator">moderator</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded-sm border border-rule-dark px-2.5 py-1 text-[0.8rem] text-ink-muted hover:border-ink hover:text-ink"
                    >
                      Set
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
