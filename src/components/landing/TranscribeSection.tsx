import Link from "next/link";

const SCAN = [92, 78, 85, 40, 88, 72, 55];

/* The handoff's transcribed/remaining counters described a transcription
   queue this archive does not run yet; per its own note they must not ship
   as facts, so the band explains the task and the counters wait for the
   queue to exist. */
export function TranscribeSection() {
  return (
    <section className="l20" aria-labelledby="tsc-h">
      <div className="l20-wrap l20-split">
        <div>
          <span className="l20-eyebrow">TRANSCRIBE</span>
          <h2 className="l20-h2 l20-h2--sm" id="tsc-h">
            Some of the record<br />is still a photograph.
          </h2>
          <p className="l20-lede" style={{ marginBottom: 22 }}>
            Older gazettes and reports exist only as scanned pages. Transcribing one into
            searchable text is a separate task from correcting a fact &mdash; no source judgment
            needed, just careful typing.
          </p>
          <Link className="l20-btn" href="/contribute">Transcribe a page</Link>
        </div>
        <div className="tsc-panel">
          <div className="tsc-scan" aria-hidden="true">
            <div className="tsc-cap">BIHAR GAZETTE &middot; 1952 &middot; P.14</div>
            {SCAN.map((w, i) => (
              <div className="tsc-line" key={i} style={{ width: w + "%" }} />
            ))}
          </div>
          <div className="tsc-out">
            <div className="tsc-out-h">TRANSCRIBED</div>
            <div className="tsc-out-p">
              &ldquo;...the Governor is pleased to notify the appointment of the Chief Secretary to
              the Government, with effect from the 4th of March, 1952...&rdquo;
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
