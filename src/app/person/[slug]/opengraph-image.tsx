import { ImageResponse } from "next/og";

import { getPersonBySlug } from "@/lib/db/queries/person";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OgFacts, OgFrame, OgLabel, OgTitle, ogFonts } from "@/lib/og";

/**
 * The card for one office-holder.
 *
 * Offices are summarised as the archive records them: which post, in which
 * state, over which years. Nothing is ranked and nothing is totalled into a
 * career judgement; the card is a contents page for the record below it.
 */
export const alt = "An office-holder's record in Abhilekh";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const OFFICE: Record<string, string> = {
  cm: "Chief Minister",
  pm: "Prime Minister",
  president: "President",
  governor: "Governor",
  presidents_rule: "President's Rule",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const person = await getPersonBySlug(slug);
  const fonts = await ogFonts();

  if (!person) {
    return new ImageResponse(
      (
        <OgFrame>
          <OgTitle text="Not in the archive">
            <div style={{ display: "flex" }}>Not in the archive</div>
          </OgTitle>
        </OgFrame>
      ),
      { ...size, fonts },
    );
  }

  const years = person.stints
    .flatMap((s) => [s.startDate.slice(0, 4), s.endDate?.slice(0, 4) ?? null])
    .filter((y): y is string => y != null)
    .sort();
  const ongoing = person.stints.some((s) => !s.endDate);
  const span =
    years.length === 0
      ? null
      : ongoing
        ? `${years[0]} to now`
        : years[0] === years[years.length - 1]
          ? years[0]
          : `${years[0]} to ${years[years.length - 1]}`;

  // Each distinct office, with the states it was held in. Ordered by how many
  // stints back it, so the post they are best known for reads first.
  const byOffice = new Map<string, Set<string>>();
  for (const s of person.stints) {
    const key = OFFICE[s.kind] ?? s.kind;
    const set = byOffice.get(key) ?? new Set<string>();
    set.add(s.stateName);
    byOffice.set(key, set);
  }
  const offices = [...byOffice.entries()].slice(0, 3);
  const party = person.stints.find((s) => s.partyName);

  return new ImageResponse(
    (
      <OgFrame footer="Every term cited, with its full edit history">
        <OgLabel>{span ? `IN OFFICE ${span.toUpperCase()}` : "OFFICE-HOLDER"}</OgLabel>
        <OgTitle text={person.name}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {party?.partyColor && (
              <div
                style={{
                  display: "flex",
                  width: 18,
                  height: 68,
                  background: party.partyColor,
                  marginRight: 24,
                }}
              />
            )}
            <div style={{ display: "flex" }}>{person.name}</div>
          </div>
        </OgTitle>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          {offices.map(([office, states]) => (
            <div key={office} style={{ display: "flex", fontSize: 27, color: OG.inkMuted }}>
              {office} · {[...states].slice(0, 3).join(", ")}
              {states.size > 3 ? ` and ${states.size - 3} more` : ""}
            </div>
          ))}
        </div>
        <OgFacts
          items={[
            {
              label: "TERMS RECORDED",
              value: String(person.stints.length),
            },
          ]}
        />
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
