import type { SeatDelta } from "@/lib/election-analysis";

/** Gains and losses vs the previous election. Server-rendered. */
export function SeatDeltaTable({ deltas }: { deltas: SeatDelta[] }) {
  if (deltas.length === 0) return null;
  return (
    <table className="w-full max-w-xl text-left text-[0.85rem]">
      <thead>
        <tr className="border-b border-rule-dark text-[0.72rem] uppercase tracking-wider text-ink-faint">
          <th className="py-1.5 pr-4 font-medium">Party</th>
          <th className="py-1.5 pr-4 text-right font-medium">Previous</th>
          <th className="py-1.5 pr-4 text-right font-medium">This election</th>
          <th className="py-1.5 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {deltas.map((d) => (
          <tr key={d.partyId} className="border-b border-rule">
            <td className="py-1.5 pr-4">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-[2px] border border-black/10"
                  style={{ backgroundColor: d.partyColor }}
                />
                {d.partyName}
              </span>
            </td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink-muted">
              {d.before ?? "—"}
            </td>
            <td className="py-1.5 pr-4 text-right tabular-nums text-ink">{d.after ?? "—"}</td>
            <td className="py-1.5 text-right tabular-nums">
              {d.delta == null ? (
                <span className="text-ink-faint">{d.after != null ? "new" : "out"}</span>
              ) : d.delta > 0 ? (
                <span className="font-medium text-approved">+{d.delta}</span>
              ) : d.delta < 0 ? (
                <span className="font-medium text-danger">{d.delta}</span>
              ) : (
                <span className="text-ink-faint">0</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
