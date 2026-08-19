/**
 * Refuse to build production with the dev sign-in variable set.
 *
 * `AUTH_DEV_LOGIN=insecure-dev-mode` enables a credentials provider that
 * authorizes any string containing an "@" with no credential at all, creating
 * the account if it does not exist. The admin bootstrap then promotes
 * ADMIN_EMAIL to administrator on sign-in. Together they are not a login
 * bypass, they are privilege escalation to full admin by typing an address
 * into a form.
 *
 * src/lib/auth.ts already refuses to register the provider when NODE_ENV or
 * VERCEL_ENV say this is a deployed build, so the variable being set would be
 * inert. This exists anyway, because a variable set in a production
 * environment is a loaded gun on a shelf: it means somebody intended it, and
 * the next refactor that touches those conditions is the one that fires it.
 *
 * Fail at build time, where a person is watching, rather than silently.
 */

const raw = process.env.AUTH_DEV_LOGIN?.trim();
const env = process.env.VERCEL_ENV;
const deployed = env === "production" || env === "preview";

if (raw && deployed) {
  console.error(
    `[check-auth-dev-login] AUTH_DEV_LOGIN is set to "${raw}" on a ${env} deployment.\n` +
      "  That variable enables a sign-in form which accepts any email address with no\n" +
      "  credential, and the admin bootstrap promotes ADMIN_EMAIL on sign-in. Set together\n" +
      "  they allow anyone to become an administrator.\n" +
      "  Remove it in Vercel under Settings > Environment Variables, for every environment\n" +
      "  except local development, and redeploy.",
  );
  process.exit(1);
}

if (raw) {
  console.warn(
    `[check-auth-dev-login] AUTH_DEV_LOGIN is set to "${raw}". Local development only: ` +
      "the provider refuses to register on any production or preview build.",
  );
} else {
  console.log("[check-auth-dev-login] OK — dev sign-in is not configured.");
}
