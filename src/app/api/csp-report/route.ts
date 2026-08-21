/**
 * Where Content-Security-Policy-Report-Only violations land.
 *
 * Logs and nothing else: no storage, no fan-out. The reports exist to answer
 * one question — what would break if the policy in next.config.ts were
 * enforced — and the console is where `vercel logs` reads. When the policy is
 * enforced and the noise question is settled, this endpoint can go.
 *
 * Browsers send report-uri payloads as application/csp-report; the body shape
 * is untrusted input from any visitor, so it is size-capped and read
 * defensively, and the response is always 204 so the endpoint reveals nothing.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const text = (await req.text()).slice(0, 8 * 1024);
    const body = JSON.parse(text) as Record<string, unknown>;
    const nested = body["csp-report"];
    const r = (typeof nested === "object" && nested !== null ? nested : body) as Record<
      string,
      unknown
    >;
    console.warn(
      "[csp-report]",
      JSON.stringify({
        document: r["document-uri"],
        directive: r["effective-directive"] ?? r["violated-directive"],
        blocked: r["blocked-uri"],
        sample: typeof r["script-sample"] === "string" ? r["script-sample"] : undefined,
      }),
    );
  } catch {
    // A malformed report is not worth an error line an attacker can fill logs with.
  }
  return new Response(null, { status: 204 });
}
