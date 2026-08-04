import type { Metadata } from "next";
import Link from "next/link";

import { SUPPORTED_QUESTIONS, tryAnswer } from "@/lib/ask";
import { searchArchive, type SearchHit } from "@/lib/db/queries/search";

export const metadata: Metadata = { title: "Search" };

/** Render a ts_headline snippet, highlighting <<…>> segments safely. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/<<|>>/);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-xs bg-amber-100 px-0.5 text-ink">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function HitRow({ hit }: { hit: SearchHit }) {
  if (hit.kind === "event") {
    return (
      <li className="py-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link
            href={`/event/${hit.id}`}
            className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
          >
            {hit.label}
          </Link>
          <span className="text-[0.78rem] text-ink-faint">
            Event · {hit.stateName} · {hit.extra}
          </span>
        </div>
        {hit.snippet ? (
          <p className="mt-0.5 max-w-2xl text-[0.83rem] text-ink-muted">
            <Snippet text={hit.snippet} />
          </p>
        ) : null}
      </li>
    );
  }
  if (hit.kind === "term") {
    return (
      <li className="py-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link
            href={`/state/${hit.stateId}`}
            className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
          >
            {hit.label}
          </Link>
          <span className="text-[0.78rem] text-ink-faint">
            Chief Minister · {hit.stateName}
            {hit.extra ? ` · ${hit.extra}` : ""}
          </span>
        </div>
      </li>
    );
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Link
          href={`/party/${hit.id}`}
          className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
        >
          {hit.label}
        </Link>
        <span className="text-[0.78rem] text-ink-faint">
          Party{hit.extra ? ` · ${hit.extra}` : ""}
        </span>
      </div>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const [results, answer] = query
    ? await Promise.all([searchArchive(query), tryAnswer(query)])
    : [null, null];

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10">
      <header className="border-b border-rule py-7">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Search</h1>
        <form action="/search" method="get" className="mt-4 flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="States, chief ministers, parties, events…"
            className="flex-1 rounded-sm border border-rule-dark bg-paper-raised px-3 py-2 text-[0.9rem] outline-none focus:border-accent"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-sm bg-ink px-5 py-2 text-[0.88rem] font-medium text-paper hover:opacity-85"
          >
            Search
          </button>
        </form>
      </header>

      {answer && (
        <div className="mt-6 rounded-sm border border-rule-dark bg-paper-raised p-5">
          <p className="section-label">Answer</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">{answer.restated}</h2>
          <ul className="mt-3 space-y-1.5">
            {answer.lines.map((l, i) => (
              <li key={i} className="text-[0.92rem] text-ink">
                {l.href ? (
                  <Link href={l.href} className="underline-offset-2 hover:text-accent hover:underline">
                    {l.text}
                  </Link>
                ) : (
                  l.text
                )}
              </li>
            ))}
          </ul>
          {answer.followUp && (
            <p className="mt-3">
              <Link
                href={answer.followUp.href}
                className="text-[0.88rem] text-accent underline-offset-2 hover:underline"
              >
                {answer.followUp.label}
              </Link>
            </p>
          )}
          <p className="mt-3 border-t border-rule pt-2 text-[0.72rem] text-ink-faint">
            How this was answered: {answer.method}
          </p>
        </div>
      )}

      {results && (
        <div className="py-6">
          {results.states.length === 0 && results.hits.length === 0 ? (
            <p className="py-8 text-center text-[0.9rem] text-ink-muted">
              No results for “{query}”. Try a chief minister&rsquo;s name, a party, or an event
              keyword like “paper leak”.
            </p>
          ) : (
            <div className="space-y-8">
              {results.states.length > 0 && (
                <section>
                  <h2 className="section-label">States &amp; Union Territories</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {results.states.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/state/${s.id}`}
                          className="inline-block rounded-sm border border-rule-dark px-3 py-1 text-[0.85rem] text-ink hover:border-ink"
                        >
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {results.hits.length > 0 && (
                <section>
                  <h2 className="section-label">Archive entries</h2>
                  <ul className="mt-1 divide-y divide-rule">
                    {results.hits.map((h) => (
                      <HitRow key={`${h.kind}-${h.id}`} hit={h} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {!results && (
        <div className="py-8 text-[0.88rem] text-ink-muted">
          <p>
            Search covers state names, chief ministers, parties, and the full text of published
            governance events — or ask a question directly:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {SUPPORTED_QUESTIONS.map((sq) => (
              <li key={sq}>
                <Link
                  href={`/search?q=${encodeURIComponent(sq)}`}
                  className="inline-block rounded-sm border border-rule-dark px-2.5 py-1 text-[0.82rem] text-ink hover:border-ink"
                >
                  “{sq}”
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
