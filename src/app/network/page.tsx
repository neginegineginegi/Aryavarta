import type { Metadata } from "next";
import Link from "next/link";

import { NetworkGraph } from "@/components/network/NetworkGraph";
import { degrees, graphEntryPoints } from "@/lib/db/queries/network";
import { neighbourhood } from "@/lib/funding/graph";
import { NODE_TYPE_LABELS, ORG_KIND_LABELS } from "@/lib/funding/labels";

export const metadata: Metadata = {
  title: "Network",
  description:
    "Documented relationships between organisations, people, funding, campaigns and cases, each one traceable to its source.",
};

export const dynamic = "force-dynamic";

/**
 * The graph, rooted at whichever entity the reader picked.
 *
 * Search-first rather than show-everything: an index that renders the whole
 * network is the thing that stops working as the dataset grows, and it also
 * invites the reader to look for shapes in a picture before they have looked at
 * any evidence.
 */
export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string }>;
}) {
  const { root } = await searchParams;
  const entries = await graphEntryPoints(24);

  const parsed = root?.includes(":")
    ? { type: root.slice(0, root.indexOf(":")), id: root.slice(root.indexOf(":") + 1) }
    : null;

  if (!parsed) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pb-4">
        <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
          <h1 className="font-display text-[clamp(30px,4vw,42px)] font-light leading-[1.05]">
            The network
          </h1>
          <p className="mt-3 max-w-[62ch] text-ink-muted">
            Every line here is one recorded relationship with a source behind it. Pick somewhere to
            start, then follow it outward. The graph will not tell you what a shape means; it will
            show you what each line rests on.
          </p>
        </header>

        <section className="section-card mt-4 px-6 py-8 sm:px-10">
          <h2 className="font-display text-[1.35rem] font-light">Start from an entity</h2>
          {entries.length === 0 ? (
            <p className="mt-3 text-ink-muted">
              No relationships have been recorded yet. The layer is built and the graph is ready;
              what it holds is a question of what has been sourced and approved so far.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {entries.map((e) => (
                <li key={`${e.type}:${e.id}`}>
                  <Link href={`/network?root=${e.type}:${e.id}`} className="net-entry" data-lamp>
                    <span className="net-entry-name">{e.label}</span>
                    <span className="net-entry-meta">
                      {e.type === "org" && e.subKind
                        ? (ORG_KIND_LABELS[e.subKind] ?? NODE_TYPE_LABELS.org)
                        : (NODE_TYPE_LABELS[e.type] ?? e.type)}
                      {" · "}
                      {e.degree} {e.degree === 1 ? "relationship" : "relationships"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const graph = await neighbourhood(parsed, { depth: 2, maxNodes: 120 });
  const deg = await degrees(graph.nodes.map((n) => ({ type: n.type, id: n.id })));
  const rootNode = graph.nodes.find((n) => n.type === parsed.type && n.id === parsed.id);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-7 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/network" className="hover:text-ink">
            Network
          </Link>
        </nav>
        <h1 className="mt-1 font-display text-[clamp(26px,3vw,34px)] font-light leading-[1.1]">
          {rootNode?.label ?? "Unknown entity"}
        </h1>
        <p className="mt-2 max-w-[68ch] text-[0.92rem] text-ink-muted">
          Two hops from here, drawn from what has been recorded and cited. Lines are relationships,
          not conclusions: click one to see the document it rests on.
        </p>
      </header>

      <section className="section-card mt-4 px-4 py-5 sm:px-6">
        {graph.nodes.length === 0 ? (
          <p className="text-ink-muted">
            Nothing is recorded against this entity yet.{" "}
            <Link href="/network" className="underline">
              Pick another starting point
            </Link>
            .
          </p>
        ) : (
          <NetworkGraph
            initialNodes={graph.nodes}
            initialEdges={graph.edges}
            initialDegrees={Object.fromEntries(deg)}
            rootKey={`${parsed.type}:${parsed.id}`}
            truncated={graph.truncated}
          />
        )}
      </section>
    </div>
  );
}
