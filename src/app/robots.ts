import type { MetadataRoute } from "next";

/**
 * What crawlers may read.
 *
 * The disallow list is not a security measure and is not treated as one: every
 * route below is protected by auth in its own right. It exists so the index
 * reflects what the archive is FOR. A moderation queue, a review diff and a
 * contributor's profile page are working surfaces, not records, and a search
 * result that lands a reader on a login wall is a worse answer than no result.
 *
 * The history routes are the interesting case. They are public by design and a
 * reader should be able to reach them, but they are per-entity changelogs whose
 * content duplicates the record they describe. Crawling them costs budget that
 * belongs to the records themselves.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Auth-gated and moderation-facing.
        "/review",
        "/review/",
        "/admin",
        "/admin/",
        "/login",
        "/signup",
        "/contribute",
        "/contribute/",
        "/user/",
        // Auth.js callback and session endpoints.
        "/api/",
        // Per-entity changelogs: public, but duplicative of the records.
        "/state/*/history",
        "/election/*/history",
        "/event/*/history",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
