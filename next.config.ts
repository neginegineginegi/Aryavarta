import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The curated party-color sheet is read at runtime when imports create
  // parties (src/lib/import/canonical-party-colors.ts); trace it into every
  // server bundle so serverless deploys can find it.
  outputFileTracingIncludes: {
    "/*": ["data/inbox/party_colors.csv"],
  },
};

export default nextConfig;
