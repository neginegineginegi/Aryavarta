# Deployment setup (Vercel + Neon + Google OAuth)

Everything the code needs is configured through environment variables — no
code changes are required to deploy. Budget ~30 minutes the first time.

## 1. Neon (Postgres)

1. Create a project at https://neon.tech (free tier is fine to start).
2. From the project dashboard, copy **two** connection strings:
   - the **pooled** one (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one → `DATABASE_URL_UNPOOLED` (used only by migrations)
3. Run migrations and the reference seed from your machine:

   ```bash
   DATABASE_URL="<direct-url>" pnpm db:migrate
   DATABASE_URL="<direct-url>" pnpm db:seed        # states/UTs + pseudo-parties only
   ```

   Do **not** run `db:seed:demo` against production — it loads obviously fake
   development content.

## 2. Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/) create (or
   pick) a project → **APIs & Services → OAuth consent screen**: External,
   fill in the app name and contact, add yourself as a test user (publish
   the app when you're ready for the public).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://<your-domain>` (and
     `http://localhost:3000` for local dev)
   - Authorized redirect URIs:
     `https://<your-domain>/api/auth/callback/google` (and
     `http://localhost:3000/api/auth/callback/google`)
3. Copy the client ID/secret → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## 3. Vercel

1. Import the GitHub repository at https://vercel.com/new (framework preset:
   Next.js; no build overrides needed).
2. Project → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon **pooled** connection string |
   | `DATABASE_URL_UNPOOLED` | Neon direct connection string |
   | `DATABASE_DRIVER` | `neon` |
   | `AUTH_SECRET` | output of `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` | from step 2 |
   | `AUTH_GOOGLE_SECRET` | from step 2 |
   | `ADMIN_EMAIL` | the Google account email that should be admin |

   Never set `AUTH_DEV_LOGIN` in production — it enables a passwordless
   sign-in form meant only for local development.

3. Deploy. Sign in with the `ADMIN_EMAIL` Google account — that account is
   promoted to admin automatically on sign-in. Promote moderators at
   `/admin/users`.

## 4. Local development

```bash
pnpm install
cp .env.example .env    # fill in at minimum DATABASE_URL + AUTH_SECRET
pnpm db:migrate && pnpm db:seed
pnpm db:seed:demo       # optional: fake content so pages aren't empty
pnpm dev
```

Without Google credentials locally, set `AUTH_DEV_LOGIN="insecure-dev-mode"`
to get a dev sign-in form on `/login` (any email; matches `ADMIN_EMAIL` for
an admin session).

## 5. Operational notes

- **Migrations** run against the *direct* (non-pooled) URL, from a laptop or
  CI — never from the serverless runtime.
- **Backups**: Neon keeps point-in-time restore according to your plan;
  export periodic SQL dumps (`pg_dump`) once real editorial content exists.
- **Legal posture** (flagged during design, not legal advice): entries name
  real people in connection with corruption/communal events. India has
  criminal defamation, and the pre-publication moderation gate may affect
  platform-vs-publisher status under the IT Act §79 safe harbor and the IT
  Rules 2021 (grievance officer, takedown timelines). The DPDP Act 2023
  applies to contributor personal data. Have counsel review before public
  launch; the /methodology correction flow is the operational half of that
  story, not the whole of it.
