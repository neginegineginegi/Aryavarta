/**
 * Distinguishable default colors for parties entering the archive via import.
 * These are deliberately arbitrary-but-distinct data colors so the map is
 * legible immediately; administrators set conventional party colors in
 * /admin/parties. (Exact brand hues are editorial metadata, not facts.)
 */
export const PARTY_PALETTE = [
  "#2563eb", // blue
  "#d97706", // amber
  "#059669", // emerald
  "#7c3aed", // violet
  "#dc2626", // red
  "#0891b2", // cyan
  "#ca8a04", // yellow-dark
  "#be185d", // pink
  "#4d7c0f", // olive
  "#9333ea", // purple
  "#ea580c", // orange
  "#0d9488", // teal
  "#b91c1c", // dark red
  "#1d4ed8", // indigo
  "#a16207", // brown
  "#15803d", // green
] as const;

export const PLACEHOLDER_GRAY = "#8a8a8a";

/** Deterministic palette pick so re-imports agree on a party's color. */
export function pickPartyColor(slug: string): string {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PARTY_PALETTE[(h >>> 0) % PARTY_PALETTE.length];
}
