import { describe, expect, it } from "vitest";

import { formatDate, formatElectionDate } from "@/lib/format";

describe("formatDate with precision (spec §2.5)", () => {
  it("renders full dates day-first by default", () => {
    expect(formatDate("2014-06-02")).toBe("2 June 2014");
  });

  it("renders month precision without the invented day", () => {
    expect(formatDate("2021-04-01", "month")).toBe("April 2021");
  });

  it("renders year precision as the year alone: 1962 never becomes 1 January 1962", () => {
    expect(formatDate("1962-01-01", "year")).toBe("1962");
  });

  it("keeps the em-dash placeholder for missing dates at any precision", () => {
    expect(formatDate(null, "year")).toBe("—");
    expect(formatDate(undefined, "month")).toBe("—");
  });
});

describe("formatElectionDate", () => {
  it("uses the row's precision when the query selected it", () => {
    expect(
      formatElectionDate({ electionDate: "1962-01-01", electionDatePrecision: "year" }),
    ).toBe("1962");
    expect(
      formatElectionDate({ electionDate: "2021-04-01", electionDatePrecision: "month" }),
    ).toBe("April 2021");
  });

  it("falls back to day rendering when precision was not selected — correct for every hand row", () => {
    expect(formatElectionDate({ electionDate: "2014-06-02" })).toBe("2 June 2014");
    expect(formatElectionDate({ electionDate: "2014-06-02", electionDatePrecision: null })).toBe(
      "2 June 2014",
    );
  });
});
