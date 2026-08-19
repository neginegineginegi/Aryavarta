import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { getSessionUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Sign in" };

// The same three locks as src/lib/auth.ts. If this drifts the page renders a
// form whose provider is not registered, which fails as a confusing error
// rather than as a refusal.
const DEV_LOGIN_ENABLED =
  process.env.AUTH_DEV_LOGIN === "insecure-dev-mode" &&
  process.env.NODE_ENV !== "production" &&
  process.env.VERCEL_ENV !== "production" &&
  process.env.VERCEL_ENV !== "preview";

function safeNext(raw: string | undefined): string {
  // Only allow same-site relative paths to prevent open redirects. Browsers
  // treat both // and /\ as scheme-relative, so reject either second char.
  if (!raw || !/^\/(?![/\\])/.test(raw)) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = safeNext(next);
  const user = await getSessionUser();
  if (user) redirect(redirectTo);

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">Sign in</h1>
      <p className="mt-2 text-[0.9rem] text-ink-muted">
        An account lets you propose additions and corrections to the archive. Browsing never
        requires one.
      </p>

      <form
        className="mt-8"
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button
          type="submit"
          className="w-full rounded-sm border border-rule-dark bg-paper-raised px-4 py-2.5 text-[0.9rem] font-medium text-ink transition-colors hover:border-ink"
        >
          Continue with Google
        </button>
      </form>

      {DEV_LOGIN_ENABLED && (
        <form
          className="mt-6 border-t border-rule pt-6"
          action={async (formData: FormData) => {
            "use server";
            await signIn("dev-login", {
              email: String(formData.get("email") ?? ""),
              redirectTo,
            });
          }}
        >
          <p className="section-label">Development sign-in</p>
          <p className="mt-1 text-[0.78rem] text-danger">
            Insecure. Enabled by AUTH_DEV_LOGIN for local development only.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.org"
              className="flex-1 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.88rem] outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-sm border border-rule-dark px-4 py-2 text-[0.88rem] hover:border-ink"
            >
              Sign in
            </button>
          </div>
        </form>
      )}

      <p className="mt-8 text-[0.78rem] leading-relaxed text-ink-faint">
        By signing in you agree that contributions you submit are published under{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          className="underline hover:text-ink"
        >
          CC BY-SA 4.0
        </a>{" "}
        and may be edited or removed through the moderation process. See{" "}
        <Link href="/methodology" className="underline hover:text-ink">
          our methodology
        </Link>
        .
      </p>
    </div>
  );
}
