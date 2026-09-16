# Known issues

Things that are wrong, found and reproduced, and not yet fixed. Each one says
what was observed rather than what was assumed, so whoever picks it up starts
from the same evidence.

Nothing is currently open.

---

## Fixed

### `/contribute` redirected to login when signed out — fixed 16 Sep 2026

**Was observed:** `GET /contribute` returned `302` to the sign-in page for an
anonymous visitor (18 Aug 2026). The homepage, the header button, About and
Methodology all pointed there, so every invitation to contribute dead-ended at
a login wall that explained nothing about what contributing involved.

**What the fix was, and where the bug actually lived.** The page was only half
of it: `src/middleware.ts` matched `/contribute/:path*`, and `*` is *zero or
more* segments, so the bare route was gated before the page ever ran. The
matcher is now `/contribute/:path+` — one or more — which leaves the submission
forms gated and lets the explainer through. The page itself no longer calls
`requireUserPage`; it reads the session, shows the contribution model to
everyone, and shows "Your submissions" only to signed-in users.

Verified against a running server: `/contribute` 200, `/contribute/event` 302,
`/review` 302, and the signed-out render carries no trace of the member
section.

**Consequences reversed:** `/contribute` was dropped from the sitemap and
disallowed in `robots.txt` because of this bug. It is back in
`src/lib/db/queries/sitemap.ts`, and `robots.ts` now disallows only
`/contribute/` (the gated forms beneath it).
