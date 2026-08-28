"use client";

import { useState } from "react";

/* Wire ACTION to a real endpoint to open sign-ups. While it is empty the
   form renders disabled and says so: a form that reports success while
   discarding the address would be the one lie this site never tells. */
const ACTION = "";
const OPEN = ACTION !== "";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!OPEN || !email || state === "sending") return;
    setState("sending");
    try {
      if (ACTION) {
        const r = await fetch(ACTION, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!r.ok) throw new Error(String(r.status));
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="l20 l20-tint nl" id="newsletter" aria-labelledby="nl-h">
      <span className="l20-eyebrow">STAY UPDATED</span>
      <h2 className="l20-h2 l20-h2--sm" id="nl-h">
        One email,<br />every time the record moves.
      </h2>
      <p className="l20-lede" style={{ margin: "0 auto 28px", maxWidth: 420 }}>
        Corrections, new collections, and new coverage. At most twice a month.
      </p>
      {state === "done" ? (
        <p className="nl-fine" role="status" style={{ fontSize: 14, color: "#52524e" }}>
          Subscribed. Look for the first email at the next correction.
        </p>
      ) : (
        <form className="nl-form" onSubmit={submit}>
          <label className="nl-input" style={{ display: "contents" }}>
            <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Email address
            </span>
            <input
              className="nl-input"
              type="email"
              required
              disabled={!OPEN}
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="nl-btn" type="submit" disabled={!OPEN || state === "sending"}>
            {state === "sending" ? "\u2026" : "Subscribe"}
          </button>
        </form>
      )}
      <div className="nl-fine">
        {!OPEN
          ? "Sign-ups aren't open yet. Until they are, every change lands on the public ledger above."
          : state === "error"
            ? "That didn't go through. Try again in a moment."
            : "No spam. Unsubscribe anytime."}
      </div>
    </section>
  );
}
