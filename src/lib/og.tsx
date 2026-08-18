import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The shared furniture for every social card.
 *
 * One frame, one palette, one pair of faces. A card is the first thing most
 * people will ever see of this archive, and three routes each inventing their
 * own layout would introduce a second visual language for the sole purpose of
 * being seen first. Everything here is lifted from the tokens in globals.css.
 *
 * Satori (behind ImageResponse) supports a subset of CSS: flexbox, absolute
 * positioning, no grid, and every element with more than one child needs an
 * explicit `display: flex`. The layouts below are flat and explicit for that
 * reason rather than by preference.
 */

/** Straight from @theme in globals.css. Never a second palette. */
export const OG = {
  paper: "#efefec",
  paperRaised: "#ffffff",
  ink: "#1a1a18",
  inkBody: "#2a2a27",
  inkMuted: "#52524e",
  inkFaint: "#8a8a84",
  rule: "#e0e0dc",
  accent: "#c2410c",
  saffron: "#ff9933",
  green: "#138808",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * The two faces, as bytes.
 *
 * `next/font` cannot supply these: it emits WOFF2 with no stable path, and
 * Satori reads TTF, OTF and WOFF only. See src/assets/fonts/README.md.
 */
export async function ogFonts() {
  const dir = join(process.cwd(), "src/assets/fonts");
  const [devanagari, latin] = await Promise.all([
    readFile(join(dir, "tiro-devanagari-wordmark.ttf")),
    readFile(join(dir, "newsreader-latin.ttf")),
  ]);
  return [
    { name: "Tiro Devanagari Hindi", data: devanagari, style: "normal" as const, weight: 400 as const },
    { name: "Newsreader", data: latin, style: "normal" as const, weight: 400 as const },
  ];
}

/**
 * The card shell: tricolour hairline, wordmark, and a footer that names the
 * archive. Children fill the middle.
 *
 * The tricolour is a 6px rule at the top and nothing else, exactly as
 * `.tricolor-strip` uses it on the site. It is never interface colour here
 * either.
 */
export function OgFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: OG.paper,
        fontFamily: "Newsreader",
      }}
    >
      <div style={{ display: "flex", height: 8, width: "100%" }}>
        <div style={{ flex: 1, background: OG.saffron }} />
        <div style={{ flex: 1, background: OG.paperRaised }} />
        <div style={{ flex: 1, background: OG.green }} />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 68px 48px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ fontFamily: "Tiro Devanagari Hindi", fontSize: 40, color: OG.ink }}>
            अभिलेखः
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          {children}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderTop: `1px solid ${OG.rule}`,
            paddingTop: 20,
            fontSize: 21,
            color: OG.inkFaint,
          }}
        >
          {footer ?? "The public record of Indian government"}
        </div>
      </div>
    </div>
  );
}

/** A line of small caps above a title, the card's echo of `.curator-label`. */
export function OgLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: OG.accent }}>
      {children}
    </div>
  );
}

/** The card's headline. Sized down as it lengthens so a long name still fits. */
export function OgTitle({ children, text }: { children: React.ReactNode; text: string }) {
  const size = text.length > 46 ? 62 : text.length > 30 ? 76 : 92;
  return (
    <div
      style={{
        display: "flex",
        fontSize: size,
        lineHeight: 1.06,
        color: OG.ink,
        marginTop: 14,
      }}
    >
      {children}
    </div>
  );
}

/** One fact under the title. Several sit in a row, separated by rules. */
export function OgFacts({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div style={{ display: "flex", marginTop: 34 }}>
      {items.map((f, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            paddingRight: 40,
            marginRight: 40,
            borderRight: i < items.length - 1 ? `1px solid ${OG.rule}` : "none",
          }}
        >
          <div style={{ display: "flex", fontSize: 19, color: OG.inkFaint, letterSpacing: 1 }}>
            {f.label}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: OG.inkBody, marginTop: 6 }}>
            {f.value}
          </div>
        </div>
      ))}
    </div>
  );
}
