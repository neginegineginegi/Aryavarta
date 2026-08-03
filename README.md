# Abhilekh — India State Politics Archive

A public, Wikipedia-style, crowdsourced reference site mapping the political
history of every Indian state and union territory, year by year, with a
citable, sourced record of governance events.

**Core principles**

- Every published fact requires at least one source citation.
- Nothing goes live without moderator approval; all changes are versioned
  with a browsable edit history and diff view.
- Content is licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Map geometry comes from
  [`@svg-maps/india`](https://www.npmjs.com/package/@svg-maps/india) (CC BY 4.0).

## Stack

Next.js (App Router) · TypeScript · Drizzle ORM · PostgreSQL · Tailwind CSS ·
Auth.js (Google OAuth) · deployable to Vercel + Neon.

## Development

```bash
pnpm install
cp .env.example .env        # fill in values
pnpm db:migrate             # apply SQL migrations
pnpm db:seed                # states/UTs + pseudo-parties (reference data only)
pnpm db:seed:demo           # optional: clearly-fake placeholder content for dev
pnpm dev
```

The default seed contains **no real political content** — only the state/UT
list and Election Commission pseudo-categories (Independent, Others). Real
content is entered through the contribution flow and verified by editors.
Demo mode (`--demo`) loads obviously fictional placeholder data ("Demo Party
Alpha", "A. Sample Kumar") for interface development; never run it in
production.

See `SETUP.md` (added in the deployment stage) for Neon, Google OAuth, and
Vercel configuration.
