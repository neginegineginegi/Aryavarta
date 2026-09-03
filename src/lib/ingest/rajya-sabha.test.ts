import { describe, expect, it } from "vitest";

import {
  aggregateRs,
  checkRsHeader,
  normalizePersonName,
  parseRsDate,
  parseRsRow,
  proposePersonMatches,
  RS_EXCLUDED_COLUMNS,
  RS_INGESTED_COLUMNS,
  type RsRow,
} from "@/lib/ingest/rajya-sabha";

const raw = (over: Partial<Record<string, string>> = {}): Record<string, string> => ({
  ID: "RS00002",
  Member_Name: "Singh, Dr. Manmohan",
  Gender_TCPD: "M",
  Start_Date: "01-10-1991",
  End_Date_Term: "30-09-1997",
  End_Date_Actual: "30-09-1997",
  Reason_of_Vacation: "Retirement",
  Party: "INC",
  State: "Assam",
  Nominated: "FALSE",
  Term_No: "1",
  Type: "Former",
  Source: "Official website; Who's Who",
  // PII the loader must never read, present as in the real file:
  Father_Name: "SHOULD NEVER LOAD",
  "E-mail": "should@never.load",
  Permanent_Address: "SHOULD NEVER LOAD",
  ...over,
});

const parsed = (over: Partial<Record<string, string>> = {}): RsRow => {
  const p = parseRsRow(raw(over));
  if ("refused" in p) throw new Error(`fixture refused: ${p.refused}`);
  return p;
};

describe("the allowlist (spec §2.1–§2.2, binding)", () => {
  it("covers exactly the 36 known columns between ingested and excluded", () => {
    expect(RS_INGESTED_COLUMNS.length + RS_EXCLUDED_COLUMNS.length).toBe(36);
    expect(RS_INGESTED_COLUMNS).toHaveLength(13);
  });

  it("keeps every PII column out of the ingested set", () => {
    for (const pii of ["Father_Name", "Mother_Name", "Date_of_Birth", "Year_of_Birth", "Place_of_Birth",
      "Marital_Status", "Spouse_Name", "Children", "Permanent_Address", "Present_Address", "E-mail"]) {
      expect(RS_INGESTED_COLUMNS as readonly string[]).not.toContain(pii);
      expect(RS_EXCLUDED_COLUMNS as readonly string[]).toContain(pii);
    }
  });

  it("parseRsRow is incapable of carrying a PII value through", () => {
    const p = parsed();
    const dumped = JSON.stringify(p);
    expect(dumped).not.toMatch(/NEVER LOAD|never\.load/);
  });
});

describe("checkRsHeader", () => {
  const realHeader = ["﻿ID", ...RS_INGESTED_COLUMNS.slice(1), ...RS_EXCLUDED_COLUMNS];

  it("passes the real header, BOM and all", () => {
    expect(checkRsHeader(realHeader)).toEqual({ ok: true, unknown: [] });
  });

  it("fails when an allowlist column is missing, and reports drift columns", () => {
    const res = checkRsHeader(realHeader.filter((c) => c !== "Term_No"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.missing).toEqual(["Term_No"]);
    const drift = checkRsHeader([...realHeader, "New_Column"]);
    expect(drift.ok && drift.unknown).toEqual(["New_Column"]);
  });
});

describe("parseRsDate", () => {
  it("parses DD-MM-YYYY and refuses everything else", () => {
    expect(parseRsDate("20-07-2022")).toBe("2022-07-20");
    expect(parseRsDate("")).toBeNull();
    expect(parseRsDate("2022-07-20")).toHaveProperty("refused");
    expect(parseRsDate("31-02-2001")).toHaveProperty("refused");
    expect(parseRsDate("01-01-1900")).toHaveProperty("refused");
  });
});

describe("parseRsRow", () => {
  it("requires the publisher's RSnnnnn identity and refuses malformed rows", () => {
    expect(parseRsRow(raw({ ID: "X1" }))).toHaveProperty("refused");
    expect(parseRsRow(raw({ Member_Name: "" }))).toHaveProperty("refused");
    expect(parseRsRow(raw({ Nominated: "yes" }))).toHaveProperty("refused");
    expect(parseRsRow(raw({ Type: "Sitting" }))).toHaveProperty("refused");
    expect(parseRsRow(raw({ Start_Date: "" }))).toHaveProperty("refused");
  });

  it("keeps the scheduled AND actual end as separate facts (spec §4.2)", () => {
    const p = parsed({ End_Date_Actual: "", Reason_of_Vacation: "" });
    expect(p.endDateTerm).toBe("1997-09-30");
    expect(p.endDateActual).toBeNull();
    expect(p.reasonOfVacation).toBe("");
  });
});

describe("aggregateRs (spec §5 coherence)", () => {
  it("groups terms under the stable TCPD ID: one person, several rows", () => {
    const rows = [parsed(), parsed({ Start_Date: "01-10-1997", End_Date_Term: "30-09-2003", Term_No: "2" })];
    const out = aggregateRs(rows);
    expect(out.members).toHaveLength(1);
    expect(out.members[0].terms).toHaveLength(2);
    expect(out.multiTermMembers).toBe(1);
    expect(out.anomalies).toEqual([]);
  });

  it("flags a NOM. row that is not nominated, and a Current row with an actual end", () => {
    const rows = [
      parsed({ Party: "NOM.", Nominated: "FALSE" }),
      parsed({ ID: "RS00003", Type: "Current", End_Date_Actual: "01-01-2020", Term_No: "1" }),
    ];
    const out = aggregateRs(rows);
    expect(out.anomalies.join(" ")).toMatch(/NOM\." on a row with Nominated=FALSE/);
    expect(out.anomalies.join(" ")).toMatch(/Current \(as of 2022-07-20\) yet End_Date_Actual/);
  });

  it("excludes NOM. from the party-label universe (not a party, §4.2)", () => {
    const rows = [parsed({ Party: "NOM.", Nominated: "TRUE" }), parsed({ ID: "RS00004", Party: "BJP" })];
    const out = aggregateRs(rows);
    expect(out.partyLabelYears.map((l) => l.label)).toEqual(["BJP"]);
  });

  it("flags duplicate Term_No and name drift within one ID", () => {
    const rows = [parsed(), parsed({ Member_Name: "Singh Manmohan, Dr.", Start_Date: "02-10-1997" })];
    const out = aggregateRs(rows);
    expect(out.anomalies.join(" ")).toMatch(/Member_Name differs/);
    expect(out.anomalies.join(" ")).toMatch(/duplicate Term_No/);
  });
});

describe("person-match candidates (spec §3: proposed, never linked)", () => {
  it("normalises honorifics and Last, First ordering for proposal only", () => {
    expect(normalizePersonName("Singh, Dr. Manmohan")).toBe("manmohan singh");
    expect(normalizePersonName("Shri Atal Bihari Vajpayee")).toBe("atal bihari vajpayee");
  });

  it("proposes a candidate when an RS member collides with an archive name", () => {
    const out = proposePersonMatches(
      [{ tcpdId: "RS00002", name: "Singh, Dr. Manmohan" }, { tcpdId: "RS00009", name: "Someone, Shri Else" }],
      [{ name: "Dr. Manmohan Singh", kind: "pm term" }],
    );
    expect(out).toEqual([
      { tcpdId: "RS00002", rsName: "Singh, Dr. Manmohan", archiveName: "Dr. Manmohan Singh", archiveKind: "pm term" },
    ]);
  });
});
