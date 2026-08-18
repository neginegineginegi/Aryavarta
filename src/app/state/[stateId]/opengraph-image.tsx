import { ImageResponse } from "next/og";

import { getStateArticle } from "@/lib/db/queries/state";
import { OG, OG_CONTENT_TYPE, OG_SIZE, OgFacts, OgFrame, OgLabel, OgTitle, ogFonts } from "@/lib/og";

/**
 * The card for one state.
 *
 * It reads through the same cached query the page does, rather than a leaner
 * query written for the card. A social card that drifts from the page it
 * advertises is the worst kind of wrong: it is the version most people see and
 * the version nobody checks.
 */
export const alt = "A state's record in Abhilekh";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const OFFICE: Record<string, string> = {
  cm: "Chief Minister",
  presidents_rule: "President's Rule",
  pm: "Prime Minister",
  president: "President",
  governor: "Governor",
};

export default async function Image({ params }: { params: Promise<{ stateId: string }> }) {
  // v16: params is a promise. See node_modules/next/dist/docs/.../opengraph-image.md
  const { stateId } = await params;
  const article = await getStateArticle(stateId);
  const fonts = await ogFonts();

  if (!article) {
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

  const { state, terms, elections } = article;
  // The government in office: the most recent term with no recorded end.
  const current = terms.find((t) => !t.endDate) ?? terms[0] ?? null;
  const office = current ? (OFFICE[current.kind] ?? "In office") : null;
  const who =
    current?.kind === "presidents_rule" ? "President's Rule" : (current?.cmName ?? "Not recorded");
  const since = current?.startDate ? current.startDate.slice(0, 4) : null;

  return new ImageResponse(
    (
      <OgFrame footer={`${state.kind === "union_territory" ? "Union territory" : "State"} · every year since 1947`}>
        <OgLabel>{state.name.toUpperCase()}</OgLabel>
        <OgTitle text={who}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* Party colour stays a data colour here, exactly as on the site:
                a mark beside the name, never a wash behind it. */}
            {current?.partyColor && (
              <div
                style={{
                  display: "flex",
                  width: 18,
                  height: 68,
                  background: current.partyColor,
                  marginRight: 24,
                }}
              />
            )}
            <div style={{ display: "flex" }}>{who}</div>
          </div>
        </OgTitle>
        {office && (
          <div style={{ display: "flex", fontSize: 27, color: OG.inkMuted, marginTop: 18 }}>
            {office}
            {current?.partyName ? ` · ${current.partyName}` : ""}
            {since ? ` · since ${since}` : ""}
          </div>
        )}
        <OgFacts
          items={[
            { label: "TERMS RECORDED", value: String(terms.length) },
            { label: "ELECTIONS", value: String(elections.length) },
          ]}
        />
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
