# Known issues

Things that are wrong, found and reproduced, and not yet fixed. Each one says
what was observed rather than what was assumed, so whoever picks it up starts
from the same evidence.

---

## `/contribute` redirects to login when signed out

**Observed:** `GET /contribute` returns `302` to the sign-in page for an
anonymous visitor. Reproduced against a production build on 18 Aug 2026.

**Why it is a bug and not a preference:** contributing is the one action the
site asks of a stranger. The homepage links to it as "Contribute a sourced
correction", the header carries a Contribute button on every page, and the
About and Methodology pages both invite it. Every one of those paths currently
dead-ends at a login wall with no explanation of what contributing involves,
what a good submission looks like, or what happens after review. A person who
does not already have an account cannot find out what they would be signing up
for.

The sign-in requirement itself is correct: contributions are attributed, and
attribution needs an account.

**Shape of the fix:** `/contribute` becomes a public page explaining the
contribution model — what is required (a published source), what review does,
what happens to your name in the edit history — with the sign-in prompt on the
form itself rather than in front of the page. The gate moves from the route to
the submit action.

**Found during:** the launch metadata task, while auditing which routes belong
in the sitemap. `/contribute` was dropped from the sitemap and disallowed in
robots.txt as a consequence, and both should be revisited when this is fixed:
a public explainer page belongs in the index.
