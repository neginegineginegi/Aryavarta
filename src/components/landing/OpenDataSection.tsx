import Link from "next/link";

/**
 * Open data: bulk download, API, license — with a live-looking API sample.
 * Server component. Point the two buttons at the real data/docs routes
 * (create /data as a stub if it doesn't exist yet).
 */

export function OpenDataSection() {
  return (
    <section className="lsec">
      <div className="lwrap odata-grid">
        <div>
          <span className="lbadge">OPEN DATA</span>
          <h2 className="lh2">The whole archive,<br />yours to take.</h2>
          <p className="lsub" style={{ marginBottom: 26 }}>
            Everything on Abhilekh is open data. Take it in bulk, query it live, and build on it.
          </p>
          <div className="odata-list">
            <div><span className="glyph">↓</span><span><strong>Bulk download</strong> — every entry as CSV or JSON, rebuilt nightly</span></div>
            <div><span className="glyph">⌁</span><span><strong>REST API</strong> — offices, elections and events by state and year</span></div>
            <div><span className="glyph">©</span><span><strong>CC BY-SA 4.0</strong> — reuse freely, credit the archive, share alike</span></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/data" className="lbtn">Download the data</Link>
            <Link href="/data" className="lbtn lbtn-ghost">API documentation</Link>
          </div>
        </div>
        <div className="odata-code" aria-label="Example API response">
          <div className="cmt">$ curl api.abhilekh.org/v1/office/bihar/cm?year=1990</div>
          <div className="brace" style={{ marginTop: 10 }}>{"{"}</div>
          <div className="row">&quot;holder&quot;: <span className="str">&quot;Lalu Prasad Yadav&quot;</span>,</div>
          <div className="row">&quot;took_office&quot;: <span className="str">&quot;1990-03-10&quot;</span>,</div>
          <div className="row">&quot;party&quot;: <span className="str">&quot;Janata Dal&quot;</span>,</div>
          <div className="row">&quot;source&quot;: <span className="str">&quot;ECI SR — Bihar 1990&quot;</span>,</div>
          <div className="row">&quot;verified&quot;: <span className="bool">true</span></div>
          <div className="brace">{"}"}</div>
        </div>
      </div>
    </section>
  );
}
