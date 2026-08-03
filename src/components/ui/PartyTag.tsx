/** Party name with its data-color swatch. The one place party color leaks
 *  out of the map: a small square chip, never a background. */
export function PartyTag({
  name,
  abbreviation,
  color,
  short = false,
}: {
  name: string | null;
  abbreviation?: string | null;
  color: string | null;
  short?: boolean;
}) {
  if (!name) {
    return <span className="italic text-ink-muted">President&rsquo;s Rule</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-black/10"
        style={{ backgroundColor: color ?? "#8a8a8a" }}
      />
      <span>{short && abbreviation ? abbreviation : name}</span>
    </span>
  );
}
