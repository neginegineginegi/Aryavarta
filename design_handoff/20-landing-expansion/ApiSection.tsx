export const ENDPOINTS = [
  { path: "GET /v1/office/:state/:role?year=", desc: "Officeholder for a state and role in a given year" },
  { path: "GET /v1/elections/:state/:year", desc: "Results and turnout for a specific election" },
  { path: "GET /v1/events?date=", desc: "Recorded events for a calendar date, any year" },
  { path: "GET /v1/timeline/:state", desc: "Full officeholder timeline for one state" },
];

/* The paths and the rate limit are the DESIGNED shape, not a promise. Correct
   them against the routes that actually exist before this ships. */
export default function ApiSection() {
  return (
    <section className="l20" aria-labelledby="api-h">
      <div className="l20-wrap l20-split">
        <div>
          <span className="l20-eyebrow">DEVELOPER API</span>
          <h2 className="l20-h2 l20-h2--sm" id="api-h">
            Query it<br />directly.
          </h2>
          <p className="l20-lede" style={{ marginBottom: 22 }}>
            The same data that renders the site, as JSON. No key needed for public read access.
          </p>
          <p className="api-free"><strong>Free tier:</strong> 1,000 requests / day, no key required</p>
          <a className="l20-btn" href="/data">Full API documentation</a>
        </div>
        <div className="api-list">
          {ENDPOINTS.map((e) => (
            <div className="api-row" key={e.path}>
              <div className="api-path">{e.path}</div>
              <div className="api-desc">{e.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
