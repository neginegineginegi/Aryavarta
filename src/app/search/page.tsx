import type { Metadata } from "next";
import Link from "next/link";

import { SUPPORTED_QUESTIONS, tryAnswer } from "@/lib/ask";
import { RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";
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
  // The page is a GET, not an action, so the limiter runs here. A refused
  // search renders as a refusal, never as an empty result: "nothing matched"
  // is a statement about the archive, and a refused query did not make it.
  const refused = query ? !(await rateLimit("search")).ok : false;
  const [results, answer] = query && !refused
    ? await Promise.all([searchArchive(query), tryAnswer(query)])
    : [null, null];

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <span lang="hi" className="deva-eyebrow">
          खोज
        </span>
        <h1 className="mt-1 font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          Ask the archive
        </h1>
        <form action="/search" method="get" className="mt-6 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Who governed Bihar in 1990?"
            className="flex-1 rounded-[14px] border border-rule bg-paper-sunken px-4 py-3 text-[16px] outline-none transition-colors focus:border-ink focus:bg-paper-raised"
            autoFocus
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        <p className="mt-3 text-[12.5px] text-ink-faint">
          Try a chief minister, a party, a state and a year, or a question the archive can
          answer from its own records.
        </p>
      </header>

      {answer && (
        <div className="section-card px-6 py-8 sm:px-10">
          <p className="font-mono text-[10px] tracking-[0.06em] text-verify">
            Structured answer
          </p>
          <h2 className="mt-3 font-display text-[30px] font-light leading-[1.2] text-ink">
            {answer.restated}
          </h2>
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
          <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
            <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
              Method
            </span>{" "}
            {answer.method}
          </p>
        </div>
      )}

      {refused && (
        <section className="section-card mt-4 px-6 py-8 sm:px-10">
          <p className="text-ink-muted">{RATE_LIMIT_MESSAGE}</p>
        </section>
      )}
      {results && (
        <div className="section-card px-6 py-8 sm:px-10">
          {results.states.length === 0 && results.hits.length === 0 ? (
            <p className="py-8 text-center text-[0.9rem] text-ink-muted">
              No results for “{query}”. Try a chief minister&rsquo;s name, a party, or an event
              keyword like “reorganisation”.
            </p>
          ) : (
            <div className="space-y-8">
              {results.states.length > 0 && (
                <section>
                  <h2 className="font-display text-[24px] font-light leading-tight text-ink">States &amp; Union Territories</h2>
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
                  <h2 className="font-display text-[24px] font-light leading-tight text-ink">Archive entries</h2>
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
        <div className="section-card px-6 py-8 text-[0.88rem] text-ink-muted sm:px-10">
          <p>
            Search covers state names, chief ministers, parties, and the full text of published
            governance events. You can also ask a question directly:
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
