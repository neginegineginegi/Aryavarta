import { ImageResponse } from "next/og";

import { getElectionDetail } from "@/lib/db/queries/election";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OgFacts, OgFrame, OgLabel, OgTitle, ogFonts } from "@/lib/og";

/**
 * The card for one election.
 *
 * The largest party by seats is named as exactly that. It is not called the
 * winner, and no government is implied from it: which party formed one is a
 * separate recorded fact, and in a hung result the two differ. The seat count
 * beside it is what the reader can check.
 */
export const alt = "An election result in Abhilekh";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ electionId: string }> }) {
  const { electionId } = await params;
  const detail = await getElectionDetail(electionId);
  const fonts = await ogFonts();

  if (!detail) {
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

  const { election, formedTerm } = detail;
  const year = election.electionDate.slice(0, 4);
  const top = election.results[0] ?? null;
  const label = `${election.stateName}, ${year}`;
  const headline = top ? (top.partyAbbreviation ?? top.partyName) : "No result recorded";

  const facts: Array<{ label: string; value: string }> = [];
  if (top) facts.push({ label: "SEATS", value: `${top.seatsWon} of ${election.totalSeats}` });
  if (election.turnoutPercent) facts.push({ label: "TURNOUT", value: `${election.turnoutPercent}%` });
  if (formedTerm?.cmName) facts.push({ label: "GOVERNMENT FORMED BY", value: formedTerm.cmName });

  return new ImageResponse(
    (
      <OgFrame footer={`${election.scope === "lok_sabha" ? "Lok Sabha" : "Assembly"} election · sourced and cited`}>
        <OgLabel>{label.toUpperCase()}</OgLabel>
        <OgTitle text={headline}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {top?.partyColor && (
              <div
                style={{
                  display: "flex",
                  width: 18,
                  height: 68,
                  background: top.partyColor,
                  marginRight: 24,
                }}
              />
            )}
            <div style={{ display: "flex" }}>{headline}</div>
          </div>
        </OgTitle>
        {top && (
          <div style={{ display: "flex", fontSize: 27, color: OG.inkMuted, marginTop: 18 }}>
            Largest party by seats
          </div>
        )}
        {facts.length > 0 && <OgFacts items={facts} />}
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
