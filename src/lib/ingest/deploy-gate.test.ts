import { describe, expect, it } from "vitest";

import {
  checkMainCodeMarkers,
  checkSchemaProbe,
  MAIN_CODE_MARKERS,
  REQUIRED_CITATION_SUBJECTS,
  type SchemaProbe,
} from "@/lib/ingest/deploy-gate";

/** A deploy branch carrying everything the inserts need. */
const deployedFiles: Record<string, string> = {
  "src/lib/format.ts": 'return formatDate(e.electionDate, e.electionDatePrecision ?? "day");',
  "src/lib/db/schema.ts": `orgKindEnum "unclassified" … pgTable("rs_members") … pgTable("rs_terms") … text("recipient_label")`,
};
const readFrom = (files: Record<string, string>) => (path: string) => files[path] ?? null;

const fullProbe: SchemaProbe = {
  orgKindUnclassified: 1,
  citationSubjects: REQUIRED_CITATION_SUBJECTS.length,
  entityRefDataset: 1,
  rsMembersTable: 1,
  rsTermsTable: 1,
  recipientLabelColumn: 1,
  electionDatePrecisionColumn: 1,
  capabilityTable: 1,
};

describe("checkMainCodeMarkers (an insert may not outrun its renderer)", () => {
  it("passes when the deploy branch carries every capability", () => {
    expect(checkMainCodeMarkers(readFrom(deployedFiles))).toEqual({ ok: true, missing: [] });
  });

  it("refuses when the precision-aware date formatter is not deployed", () => {
    const stale = { ...deployedFiles, "src/lib/format.ts": "return formatDate(e.electionDate);" };
    const r = checkMainCodeMarkers(readFrom(stale));
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toMatch(/precision-aware election-date rendering/);
    expect(r.missing.join(" ")).toMatch(/1 January/); // the failure it prevents, named
  });

  it("refuses when the schema the rows need is not on the deploy branch", () => {
    const stale = { ...deployedFiles, "src/lib/db/schema.ts": "nothing of the sort" };
    const r = checkMainCodeMarkers(readFrom(stale));
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(3); // unclassified, rs_members, recipient_label
  });

  it("refuses when a whole file is absent from the deploy branch", () => {
    const r = checkMainCodeMarkers(readFrom({}));
    expect(r.ok).toBe(false);
    expect(r.missing.every((m) => m.includes("not on the deploy branch at all"))).toBe(true);
    expect(r.missing).toHaveLength(MAIN_CODE_MARKERS.length);
  });
});

describe("checkSchemaProbe (an insert may not outrun its migration)", () => {
  it("passes on a fully migrated database", () => {
    expect(checkSchemaProbe(fullProbe)).toEqual({ ok: true, missing: [] });
  });

  it("names each missing enum value, table and column", () => {
    const r = checkSchemaProbe({
      ...fullProbe,
      orgKindUnclassified: 0,
      citationSubjects: 2,
      entityRefDataset: 0,
      rsTermsTable: 0,
      recipientLabelColumn: 0,
      electionDatePrecisionColumn: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.missing.join("\n")).toMatch(/org_kind is missing the value 'unclassified'/);
    expect(r.missing.join("\n")).toMatch(/citation_subject carries 2 of the 5/);
    expect(r.missing.join("\n")).toMatch(/entity_ref is missing the value 'dataset'/);
    expect(r.missing.join("\n")).toMatch(/table rs_terms does not exist/);
    expect(r.missing.join("\n")).toMatch(/recipient_label does not exist/);
    expect(r.missing.join("\n")).toMatch(/election_date_precision does not exist/);
  });

  it("refuses a database whose schema was applied without leaving a record", () => {
    const r = checkSchemaProbe({ ...fullProbe, capabilityTable: 0 });
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toMatch(/nothing has recorded a migration here/);
  });
});
