import QuestionChips from "./QuestionChips";

/* The verified answer below is real: Punjab was under President's Rule from
   11 May 1987 to 25 Feb 1992, so no CM held office during 1987. Keep the
   source line attached to whatever answer this section shows. */
export default function SearchDemo() {
  return (
    <section className="l20 l20-tint" aria-labelledby="sdemo-h">
      <div className="l20-head">
        <span className="l20-eyebrow">ASK THE ARCHIVE</span>
        <h2 className="l20-h2" id="sdemo-h">
          Ask it in<br />plain language.
        </h2>
        <p className="l20-lede">
          Type a question the way you&rsquo;d ask a person. The answer comes back with the office,
          the dates, and the source.
        </p>
      </div>
      <div className="sdemo-inner">
        <div className="sdemo-bar">
          <span className="sdemo-icon" aria-hidden="true">&#8981;</span>
          <span className="sdemo-q">Who was the chief minister of Punjab in 1987?</span>
          <span className="sdemo-ask" aria-hidden="true">Ask</span>
        </div>
        <div className="sdemo-ans">
          <div className="sdemo-flag">&#10003; VERIFIED ANSWER</div>
          <div className="sdemo-a-h">Punjab was under President&rsquo;s Rule for all of 1987.</div>
          <div className="sdemo-a-p">
            No chief minister held office that year. The state was under central administration
            from May 1987 to February 1992.
          </div>
          <div className="sdemo-src">SOURCE: MINISTRY OF HOME AFFAIRS, ANNUAL REPORT 1987&ndash;88</div>
        </div>
        <div className="sdemo-try">TRY ONE OF THESE</div>
        <QuestionChips />
      </div>
    </section>
  );
}
