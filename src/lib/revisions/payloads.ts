import { z } from "zod";

import {
  eventTypeEnum,
  promiseCategoryEnum,
  promiseScopeEnum,
  revisionEntityEnum,
} from "@/lib/db/schema";

/**
 * The payload contract shared by forms, snapshots, the approval transaction,
 * and the diff view. before_data and after_data in the revisions table are
 * exactly these shapes (schema_version 1).
 */

// ---------------------------------------------------------------------------
// Source URLs
// ---------------------------------------------------------------------------

/**
 * Normalize a citation URL: require http(s), lowercase the host, drop
 * fragments and trailing slashes. Throws on anything unsafe (javascript:,
 * data:, relative URLs) — this is the XSS gate for user-supplied links.
 */
export function normalizeSourceUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Source URL is not a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Source URLs must use http:// or https://.");
  }
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  let s = url.toString();
  if (url.pathname === "/" && !url.search) s = s.replace(/\/$/, "");
  else s = s.replace(/\/(?=$)/, "");
  if (s.length > 2000) throw new Error("Source URL is too long.");
  return s;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
  .refine((d) => !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()), "Not a real date");

export const sourceSnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Source title is too short").max(300),
  url: z
    .string()
    .trim()
    .min(10, "Source URL is required")
    .max(2000)
    .transform((raw, ctx) => {
      try {
        return normalizeSourceUrl(raw);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    }),
  publisher: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)),
  publishedOn: isoDate.nullish().transform((v) => v ?? null),
  accessedOn: isoDate.nullish().transform((v) => v ?? null),
});

export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

/** Every published fact requires at least one source — the project's hard rule. */
const sourcesField = z
  .array(sourceSnapshotSchema)
  .min(1, "At least one source citation is required")
  .max(10, "At most 10 sources per entry");

// ---------------------------------------------------------------------------
// Entity payloads
// ---------------------------------------------------------------------------

const CURRENT_YEAR_MAX = 2100; // sanity bound; real bound applied at runtime

export const eventPayloadSchema = z
  .object({
    stateId: z.string().trim().min(2).max(8),
    year: z.number().int().min(1947).max(CURRENT_YEAR_MAX),
    eventDate: isoDate.nullish().transform((v) => v ?? null),
    type: z.enum(eventTypeEnum.enumValues),
    title: z.string().trim().min(10, "Title is too short").max(200),
    description: z.string().trim().min(40, "Description is too short (min 40 chars)").max(8000),
    sources: sourcesField,
  })
  .superRefine((v, ctx) => {
    if (v.year > new Date().getFullYear()) {
      ctx.addIssue({ code: "custom", path: ["year"], message: "Year cannot be in the future" });
    }
    if (v.eventDate && Number(v.eventDate.slice(0, 4)) !== v.year) {
      ctx.addIssue({
        code: "custom",
        path: ["eventDate"],
        message: "Event date must fall within the stated year",
      });
    }
  });

export type EventPayload = z.infer<typeof eventPayloadSchema>;

export const termPayloadSchema = z
  .object({
    stateId: z.string().trim().min(2).max(8),
    kind: z.enum(["cm", "presidents_rule", "pm", "president", "governor"]),
    cmName: z.string().trim().min(2).max(150).nullish().transform((v) => (v ? v : null)),
    partyId: z.string().trim().min(2).max(64).nullish().transform((v) => (v ? v : null)),
    startDate: isoDate,
    endDate: isoDate.nullish().transform((v) => v ?? null),
    notes: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
    sources: sourcesField,
  })
  .superRefine((v, ctx) => {
    const isUnionKind = v.kind === "pm" || v.kind === "president";
    // Union offices live only on the 'in' pseudo-entity; state offices never do.
    if (isUnionKind && v.stateId !== "in") {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Prime Minister / President terms belong to India (Union), not a state",
      });
    }
    if (!isUnionKind && v.stateId === "in") {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "India (Union) holds PM/President terms, not CM terms",
      });
    }
    if (v.kind === "cm" || v.kind === "pm") {
      if (!v.cmName)
        ctx.addIssue({
          code: "custom",
          path: ["cmName"],
          message: v.kind === "pm" ? "Prime Minister name is required" : "Chief Minister name is required",
        });
      if (!v.partyId)
        ctx.addIssue({ code: "custom", path: ["partyId"], message: "Party is required" });
    } else if (v.kind === "president" || v.kind === "governor") {
      if (!v.cmName)
        ctx.addIssue({
          code: "custom",
          path: ["cmName"],
          message: `${v.kind === "governor" ? "Governor's" : "President's"} name is required`,
        });
      // Presidents and Governors are conventionally shown without party; allow either.
    } else {
      if (v.cmName || v.partyId) {
        ctx.addIssue({
          code: "custom",
          path: ["kind"],
          message: "President's Rule periods cannot have a CM or party",
        });
      }
    }
    if (v.endDate && v.endDate <= v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after start date" });
    }
  });

export type TermPayload = z.infer<typeof termPayloadSchema>;

export const electionResultSchema = z.object({
  partyId: z.string().trim().min(2).max(64),
  seats: z.number().int().min(0).max(1000),
  voteSharePercent: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
  // Optional richness (additive): older stored payloads simply lack these.
  seatsContested: z.number().int().min(0).max(1000).nullish().transform((v) => v ?? null),
  allianceName: z.string().trim().max(120).nullish().transform((v) => (v ? v : null)),
});

export const electionPayloadSchema = z
  .object({
    stateId: z.string().trim().min(2).max(8),
    scope: z.enum(["state_assembly", "lok_sabha"]).default("state_assembly"),
    assemblyNumber: z.number().int().min(1).max(50).nullish().transform((v) => v ?? null),
    electionDate: isoDate,
    resultSummary: z.string().trim().max(2000).nullish().transform((v) => (v ? v : null)),
    totalSeats: z.number().int().min(1).max(1000).nullish().transform((v) => v ?? null),
    turnoutPercent: z.number().min(0).max(100).nullish().transform((v) => v ?? null),
    results: z.array(electionResultSchema).max(30).default([]),
    sources: sourcesField,
  })
  .superRefine((v, ctx) => {
    if (v.scope === "lok_sabha" && v.stateId !== "in") {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: "Lok Sabha elections belong to India (Union)",
      });
    }
    if (v.scope === "state_assembly" && v.stateId === "in") {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: "India (Union) holds Lok Sabha elections, not assembly elections",
      });
    }
    const partyIds = v.results.map((r) => r.partyId);
    if (new Set(partyIds).size !== partyIds.length) {
      ctx.addIssue({ code: "custom", path: ["results"], message: "Each party may appear only once" });
    }
    if (v.totalSeats != null) {
      const sum = v.results.reduce((a, r) => a + r.seats, 0);
      if (sum > v.totalSeats) {
        ctx.addIssue({
          code: "custom",
          path: ["results"],
          message: `Seat counts (${sum}) exceed total seats (${v.totalSeats})`,
        });
      }
    }
  });

export type ElectionPayload = z.infer<typeof electionPayloadSchema>;

// ---------------------------------------------------------------------------
// Canonicalization: stable ordering so deep-equality on snapshots is
// meaningful for conflict detection and diffing.
// ---------------------------------------------------------------------------

export function canonicalizeSources<T extends { url: string }>(sources: T[]): T[] {
  return sources.slice().sort((a, b) => a.url.localeCompare(b.url));
}

export function canonicalizeResults<T extends { partyId: string }>(results: T[]): T[] {
  return results.slice().sort((a, b) => a.partyId.localeCompare(b.partyId));
}

/**
 * A promise extracted from a manifesto.
 *
 * `officialText` is the quoted wording and is required; `plainText` is an
 * optional editorial restatement shown under a label. `pageRef` is what makes
 * the entry checkable, so the proposal form asks for it even though the schema
 * allows it to be absent for documents without page numbers.
 *
 * Note there is no status field. Whether a promise was kept is never the
 * archive's own claim; that is a separate, attributed, sourced record.
 */
export const promisePayloadSchema = z.object({
  documentId: z.string().uuid(),
  partyId: z.string().trim().min(2).max(64).nullish().transform((v) => v ?? null),
  electionId: z.string().uuid().nullish().transform((v) => v ?? null),
  stateId: z.string().trim().min(2).max(8).nullish().transform((v) => v ?? null),
  officialText: z
    .string()
    .trim()
    .min(10, "Quote the promise as written (min 10 chars)")
    .max(4000),
  officialLang: z.string().trim().min(2).max(8).default("en"),
  plainText: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => (v ? v : null)),
  category: z.enum(promiseCategoryEnum.enumValues).default("other"),
  scope: z.enum(promiseScopeEnum.enumValues).default("unspecified"),
  statedTimeline: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)),
  statedBudgetInr: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
  pageRef: z.string().trim().max(60).nullish().transform((v) => (v ? v : null)),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  sources: sourcesField,
});

export type PromisePayload = z.infer<typeof promisePayloadSchema>;

export function canonicalizePromise(p: PromisePayload): PromisePayload {
  return { ...p, sources: canonicalizeSources(p.sources) };
}

export function canonicalizeEvent(p: EventPayload): EventPayload {
  return { ...p, sources: canonicalizeSources(p.sources) };
}

export function canonicalizeTerm(p: TermPayload): TermPayload {
  return { ...p, sources: canonicalizeSources(p.sources) };
}

export function canonicalizeElection(p: ElectionPayload): ElectionPayload {
  return {
    ...p,
    results: canonicalizeResults(p.results),
    sources: canonicalizeSources(p.sources),
  };
}

/**
 * Entity types the revision machinery can apply today.
 *
 * The database enum is deliberately wider: the Funding and Influence layer's
 * types land with its schema so the tables and the review path are versioned
 * together, but their payload schemas and apply branches arrive in phase 2.
 * Anything not listed here is refused at approval with a clear message rather
 * than half-applied by a branch that does not exist yet.
 */
/** Every value the database enum holds, applicable or not. */
export type RevisionEntityType = (typeof revisionEntityEnum.enumValues)[number];

export const SUPPORTED_ENTITY_TYPES = ["term", "election", "event", "manifesto_promise"] as const;

export type EntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];

export function isSupportedEntityType(value: string): value is EntityType {
  return (SUPPORTED_ENTITY_TYPES as readonly string[]).includes(value);
}

export type AnyPayload = TermPayload | ElectionPayload | EventPayload | PromisePayload;

export const payloadSchemaFor = {
  term: termPayloadSchema,
  election: electionPayloadSchema,
  event: eventPayloadSchema,
  manifesto_promise: promisePayloadSchema,
} as const;

export const canonicalizeFor = {
  term: canonicalizeTerm,
  election: canonicalizeElection,
  event: canonicalizeEvent,
  manifesto_promise: canonicalizePromise,
} as const;
