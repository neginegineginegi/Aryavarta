import type { MetadataRoute } from "next";

import { sitemapEntries } from "@/lib/db/queries/sitemap";

/**
 * The sitemap, generated from the database and never hand-maintained.
 *
 * This is a Route Handler that Next caches by default, which is the right
 * behaviour here rather than something to work around: the build pipeline runs
 * the loaders before `next build`, so a deploy is exactly when the archive's
 * contents change, and a sitemap regenerated per deploy tracks that precisely.
 *
 * `changeFrequency` and `priority` are deliberately absent. Google has said for
 * years that it ignores both, and inventing a per-route priority scale would be
 * this file asserting which records matter most, which is not a judgement the
 * archive makes anywhere else.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const entries = await sitemapEntries();

  return entries.map((e) => ({
    url: `${base}${e.path}`,
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
  }));
}
