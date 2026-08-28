import Link from "next/link";

/**
 * Sample-question chips for the closing CTA ("Start with a question.").
 * Mount inside the CTA card, directly after its primary button.
 */

const QS: [label: string, query: string][] = [
  ["Who was CM of Bihar in 1990?", "bihar cm 1990"],
  ["What happened in the 1977 election?", "1977 general election"],
  ["When was Punjab under President's Rule?", "punjab presidents rule"],
  ["Who governed Kerala in 1957?", "kerala 1957"],
  ["How many women have been CMs?", "women chief ministers"],
];

export function QuestionChips() {
  return (
    <div className="qchips">
      {QS.map(([label, q]) => (
        <Link key={q} href={{ pathname: "/search", query: { q } }}>{label}</Link>
      ))}
    </div>
  );
}
