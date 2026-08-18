/**
 * Refuse to build production without NEXT_PUBLIC_SITE_URL.
 *
 * `metadataBase` in src/app/layout.tsx falls back to http://localhost:3000, and
 * every absolute URL the site emits is resolved against it: the sitemap's
 * <loc> entries, the robots Sitemap: line, and the og:image and twitter:image
 * URLs on every page. Missing the variable does not break the build or throw at
 * runtime. It ships a sitemap full of localhost URLs and social cards pointing
 * at an image nobody outside the machine can fetch.
 *
 * That failure is silent, and worse, it is sticky: search engines and LinkedIn
 * both cache the first thing they scrape, so the damage outlives the fix by
 * however long their caches hold. A build that stops is cheaper.
 *
 * Production only. Local builds and CI without a domain are legitimate; a
 * preview without the variable gets a warning, because preview URLs are
 * per-deployment and setting one fixed value for them is a choice rather than
 * an error.
 */

const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development'

/** A value that is present but unusable is worse than one that is absent. */
function invalidReason(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "it is not a valid URL";
  }
  if (url.protocol !== "https:") return `its protocol is ${url.protocol}, not https:`;
  if (/^localhost$|^127\.|^0\.0\.0\.0$/.test(url.hostname))
    return `it points at ${url.hostname}, which no crawler can reach`;
  return null;
}

if (!raw) {
  const message =
    "[check-site-url] NEXT_PUBLIC_SITE_URL is not set.\n" +
    "  Every absolute URL this build emits would resolve against http://localhost:3000:\n" +
    "  the sitemap, the robots Sitemap: line, and every og:image and twitter:image tag.\n" +
    "  Set it in Vercel under Settings > Environment Variables, e.g. https://abhilekh.example.";
  if (env === "production") {
    console.error(message);
    process.exit(1);
  }
  console.warn(`${message}\n  (Not a production build, so continuing.)`);
} else {
  const reason = invalidReason(raw);
  if (reason) {
    const message =
      `[check-site-url] NEXT_PUBLIC_SITE_URL is "${raw}", but ${reason}.\n` +
      "  Absolute URLs built from it would be unreachable.";
    if (env === "production") {
      console.error(message);
      process.exit(1);
    }
    console.warn(`${message}\n  (Not a production build, so continuing.)`);
  } else {
    console.log(`[check-site-url] OK — absolute URLs will resolve against ${raw}`);
  }
}
