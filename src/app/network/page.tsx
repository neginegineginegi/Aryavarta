import type { Metadata } from "next";
import Link from "next/link";

import { NetworkGraph } from "@/components/network/NetworkGraph";
import { wholeGraph } from "@/lib/funding/graph";
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
  searchParams: Promise<{ root?: string; show?: string }>;
}) {
  const { root, show } = await searchParams;
  const filter = show === "orgs" ? "org" : show === "people" ? "person" : undefined;
  const entries = await graphEntryPoints(filter ? 48 : 60, filter as "org" | undefined);

  const parsed = root?.includes(":")
    ? { type: root.slice(0, root.indexOf(":")), id: root.slice(root.indexOf(":") + 1) }
    : null;

  if (!parsed) {
    // The whole web renders only while it fits one canvas; past the stated cap
    // it steps back to search-first and the page says so.
    const web = !filter ? await wholeGraph() : null;
    const webDegrees =
      web && !web.truncated
        ? await degrees(web.nodes.map((n) => ({ type: n.type, id: n.id })))
        : new Map<string, number>();

    return (
      <div className="mx-auto max-w-[1400px] px-4 pb-4">
        <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
          <h1 className="font-display text-[clamp(30px,4vw,42px)] font-light leading-[1.05]">
            The network
          </h1>
          <p className="mt-3 max-w-[62ch] text-ink-muted">
            Every line here is one recorded relationship with a source behind it. The graph will
            not tell you what a shape means; it will show you what each line rests on.
          </p>
        </header>

        {web && !web.truncated && web.nodes.length > 0 && (
          <section className="section-card mt-4 px-4 py-5 sm:px-6">
            <p className="mb-3 max-w-[75ch] text-[0.88rem] text-ink-muted">
              Everything recorded so far, on one canvas. It opens as organisations and the money and
              ownership recorded between them, with people folded away. Click an organisation to
              open it and the people recorded in it appear. Somebody recorded in two organisations
              is drawn once, with a line to each, so opening the second one does not create a second
              copy of them. Click a line for its evidence, drag to rearrange.
            </p>
            <NetworkGraph
              initialNodes={web.nodes}
              initialEdges={web.edges}
              initialDegrees={Object.fromEntries(webDegrees)}
              rootKey={null}
              truncated={false}
              collapsible
            />
          </section>
        )}
        {web?.truncated && (
          <section className="section-card mt-4 px-6 py-6 sm:px-10">
            <p className="max-w-[70ch] text-[0.9rem] text-ink-muted">
              The web has grown past what one canvas can show legibly, so this page starts from a
              single entity instead. Pick one below.
            </p>
          </section>
        )}

        <section className="section-card mt-4 px-6 py-8 sm:px-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[1.35rem] font-light">Start from an entity</h2>
            {/* Server-rendered filter: people are entities in this network by
                design, and a person on two boards is exactly what it exists to
                surface, but a mixed flat list is the wrong way to browse. */}
            <nav className="net-filter" aria-label="Filter by kind">
              <Link href="/network" className={!filter ? "is-on" : ""}>
                Everything
              </Link>
              <Link href="/network?show=orgs" className={filter === "org" ? "is-on" : ""}>
                Organisations
              </Link>
              <Link href="/network?show=people" className={filter === "person" ? "is-on" : ""}>
                People
              </Link>
            </nav>
          </div>
          {entries.length === 0 ? (
            <div className="mt-3 space-y-4 text-ink-muted">
              <p className="max-w-[62ch]">
                <strong className="text-ink">No relationships have been recorded yet.</strong> The
                graph, the evidence panels and the connection finder are all built and working;
                they have nothing to draw. Records enter this layer the same way every other record
                does, by being proposed with a source and approved in review.
              </p>
              <div>
                <h3 className="text-[0.95rem] text-ink">What will be here</h3>
                <ul className="mt-2 max-w-[62ch] list-disc space-y-1 pl-5">
                  <li>
                    A network you can follow outward from any organisation, person, campaign,
                    project or case, one hop at a time.
                  </li>
                  <li>
                    A panel on every line showing the document behind it, its page reference, and
                    what the relationship does not say.
                  </li>
                  <li>A year slider, so you can ask what the network looked like in 2014.</li>
                  <li>
                    Structure: which entities hold two groups together, and which are reached by
                    more than one route.
                  </li>
                  <li>Notes and flags of your own, kept in your browser and nowhere else.</li>
                </ul>
              </div>
              <p className="max-w-[62ch]">
                <Link href="/network/connect" className="underline hover:text-accent">
                  The connection finder
                </Link>{" "}
                is open now and will answer as soon as there are records to answer with. The design,
                and the reasons behind every safeguard in it, are in the architecture note in the
                repository.
              </p>
            </div>
          ) : (
            <EntryGroups entries={entries} grouped={!filter} />
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
          not conclusions: click one to see the document it rests on. Double click an entity to
          pull in one more hop.
        </p>
        <p className="mt-2 text-[0.85rem]">
          <Link href={`/network/connect?a=${parsed.type}:${parsed.id}`} className="underline hover:text-accent">
            Find what connects this to something else
          </Link>
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


type Entry = Awaited<ReturnType<typeof graphEntryPoints>>[number];

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {entries.map((e) => (
        <li key={`${e.type}:${e.id}`}>
          <Link
            href={
              e.degree > 0 || !e.slug
                ? `/network?root=${e.type}:${e.id}`
                : `/network/${e.type === "org" ? "org" : "person"}/${e.slug}`
            }
            className="net-entry"
            data-lamp
          >
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
  );
}

/** Unfiltered, the list is grouped by kind so people and organisations never
 *  interleave; filtered, it is flat because the heading would repeat the pill. */
function EntryGroups({ entries, grouped }: { entries: Entry[]; grouped: boolean }) {
  if (!grouped) return <EntryList entries={entries} />;
  const orgs = entries.filter((e) => e.type === "org");
  const people = entries.filter((e) => e.type === "person");
  const rest = entries.filter((e) => e.type !== "org" && e.type !== "person");
  return (
    <>
      {orgs.length > 0 && (
        <>
          <h3 className="mt-5 text-[0.8rem] tracking-[0.04em] text-ink-faint">Organisations</h3>
          <EntryList entries={orgs} />
        </>
      )}
      {people.length > 0 && (
        <>
          <h3 className="mt-6 text-[0.8rem] tracking-[0.04em] text-ink-faint">People</h3>
          <EntryList entries={people} />
        </>
      )}
      {rest.length > 0 && (
        <>
          <h3 className="mt-6 text-[0.8rem] tracking-[0.04em] text-ink-faint">
            Campaigns, projects and cases
          </h3>
          <EntryList entries={rest} />
        </>
      )}
    </>
  );
}
