import { ImageResponse } from "next/og";

import { getArchiveStats } from "@/lib/db/queries/stats";
import { formatNumber } from "@/lib/format";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OgFacts, OgFrame, OgTitle } from "@/lib/og";

/**
 * The default card, inherited by every route without one of its own.
 *
 * It states what the archive covers, in the archive's own figures read from
 * the database at build time. A card claiming "39 states, 79 years" that had
 * been typed in by hand would be the one number on this site nobody could
 * check, which is not a thing to hand to the part of it most people see first.
 */
export const alt = "Abhilekh, the public record of Indian government";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const FIRST_YEAR = 1947;

export default async function Image() {
  const [stats, { ogFonts }] = await Promise.all([getArchiveStats(), import("@/lib/og")]);
  const years = new Date().getFullYear() - FIRST_YEAR;

  return new ImageResponse(
    (
      <OgFrame footer="Every fact cited. Every change reviewed and kept.">
        <OgTitle text="The public record of Indian government">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>The public record</div>
            <div style={{ display: "flex" }}>of Indian government</div>
          </div>
        </OgTitle>
        <div style={{ display: "flex", fontSize: 26, color: OG.inkMuted, marginTop: 22 }}>
          Who governed every state and union territory, year by year since {FIRST_YEAR}.
        </div>
        <OgFacts
          items={[
            { label: "STATES & UTS", value: formatNumber(stats.states) },
            { label: "YEARS", value: String(years) },
            { label: "TERMS", value: formatNumber(stats.terms) },
            { label: "SOURCES", value: formatNumber(stats.sources) },
          ]}
        />
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
