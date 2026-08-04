"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { openReport, type OpenReportResult } from "@/actions/reports";
import { Field, FormError, inputClass, SubmitButton } from "@/components/forms/fields";

export function ReportForm({
  entityType,
  entityId,
  entityLabel,
  isSignedIn,
  backHref,
}: {
  entityType: "term" | "election" | "event";
  entityId: string;
  entityLabel: string;
  isSignedIn: boolean;
  backHref: string;
}) {
  const [kind, setKind] = useState<"issue" | "dispute">("issue");
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [result, setResult] = useState<OpenReportResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="rounded-sm border border-green-200 bg-green-50 p-5">
        <h2 className="font-display text-xl font-semibold text-approved">Report filed</h2>
        <p className="mt-2 text-[0.9rem] text-ink-muted">
          Thank you. A moderator will review the report; its resolution will be recorded
          publicly.{" "}
          <Link href={backHref} className="text-accent underline-offset-2 hover:underline">
            Back to the entry →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setResult(
            await openReport({
              entityType,
              entityId,
              kind,
              reason,
              reporterContact: contact,
            }),
          );
        });
      }}
      className="space-y-5"
    >
      <FormError message={result && !result.ok ? result.error : null} />
      <p className="text-[0.88rem] text-ink-muted">
        Reporting: <strong className="text-ink">{entityLabel}</strong>
      </p>

      <Field label="What kind of problem?" required>
        <select
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as "issue" | "dispute")}
        >
          <option value="issue">
            Issue: typo, broken source link, formatting, categorization
          </option>
          <option value="dispute">
            Dispute: I believe this entry is factually wrong or unfairly framed
          </option>
        </select>
      </Field>

      <Field
        label="Describe the problem"
        required
        hint="Be specific. For disputes, cite counter-sources if you have them; moderators weigh evidence, not votes."
      >
        <textarea
          className={`${inputClass} min-h-36`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={20}
          maxLength={4000}
          required
        />
      </Field>

      {!isSignedIn && (
        <Field
          label="Contact (optional)"
          hint="You're reporting anonymously. Leave an email if you'd like to be reachable about this report."
        >
          <input
            className={inputClass}
            type="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
          />
        </Field>
      )}

      <SubmitButton pending={pending}>File report</SubmitButton>
    </form>
  );
}
