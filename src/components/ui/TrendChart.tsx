/**
 * Server-rendered SVG line chart for a yearly series. No client JS, no
 * dependencies; styled with theme tokens so it reads as part of the page.
 * This is the reusable visualization primitive for every data layer:
 * anything with (year, value) points can render one.
 */
export function TrendChart({
  points,
  width = 260,
  height = 64,
  ariaLabel,
}: {
  points: Array<{ year: number; value: number }>;
  width?: number;
  height?: number;
  ariaLabel?: string;
}) {
  const clean = points
    .filter((p) => Number.isFinite(p.value) && Number.isFinite(p.year))
    .sort((a, b) => a.year - b.year);
  if (clean.length < 2) return null;

  const PAD_X = 4;
  const PAD_Y = 8;
  const years = clean.map((p) => p.year);
  const values = clean.map((p) => p.value);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const minX = years[0];
  const maxX = years[years.length - 1];
  const spanY = maxY - minY || 1;
  const spanX = maxX - minX || 1;

  const x = (year: number) => PAD_X + ((year - minX) / spanX) * (width - PAD_X * 2);
  const y = (v: number) => height - PAD_Y - ((v - minY) / spanY) * (height - PAD_Y * 2);
  const path = clean.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = clean[clean.length - 1];

  const fmt = (v: number) =>
    Math.abs(v) >= 10000 ? v.toLocaleString("en-IN") : String(Math.round(v * 100) / 100);

  return (
    <figure className="inline-block" role="img" aria-label={ariaLabel ?? `Trend from ${minX} to ${maxX}`}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block">
        <line
          x1={PAD_X}
          y1={height - PAD_Y}
          x2={width - PAD_X}
          y2={height - PAD_Y}
          stroke="var(--color-rule-dark)"
          strokeWidth="1"
        />
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
        {clean.map((p) => (
          <circle key={p.year} cx={x(p.year)} cy={y(p.value)} r="1.8" fill="var(--color-accent)">
            <title>{`${p.year}: ${fmt(p.value)}`}</title>
          </circle>
        ))}
        <circle cx={x(last.year)} cy={y(last.value)} r="2.6" fill="var(--color-accent)" />
      </svg>
      <figcaption className="flex justify-between font-mono text-[0.6rem] text-ink-faint">
        <span>{minX}</span>
        <span>
          {fmt(minY)} – {fmt(maxY)}
        </span>
        <span>{maxX}</span>
      </figcaption>
    </figure>
  );
}
