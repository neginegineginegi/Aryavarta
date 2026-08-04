"use server";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { states } from "@/lib/db/schema";
import { AuthzError, requireRole } from "@/lib/authz";
import {
  createElectionDrafts,
  createTermDrafts,
  type DraftOutcome,
} from "@/lib/import/drafts";
import {
  fetchElections,
  fetchHeadTerms,
  resolveState,
  type ImportedElection,
  type ImportedTerm,
  type StateResolution,
} from "@/lib/import/wikidata";

// cm_terms = P6 head of government (CM for states, PM for India);
// heads_of_state = P35 (President — union only); elections by label pattern.
export type ImportKind = "cm_terms" | "heads_of_state" | "elections";

export type PreviewResult =
  | {
      ok: true;
      resolution: StateResolution;
      terms?: ImportedTerm[];
      elections?: ImportedElection[];
    }
  | { ok: false; error: string };

/**
 * Fetch + parse only — zero database writes. The admin inspects exactly what
 * was found (including the matched Wikidata item) before creating drafts.
 */
export async function previewImport(input: {
  stateId: string;
  kind: ImportKind;
  qidOverride?: string;
}): Promise<PreviewResult> {
  try {
    await requireRole("admin");
  } catch (e) {
    return { ok: false, error: e instanceof AuthzError ? e.message : "Not authorized." };
  }

  const state = await db.query.states.findFirst({ where: eq(states.id, input.stateId) });
  if (!state) return { ok: false, error: "Unknown state." };

  try {
    let resolution: StateResolution;
    if (input.qidOverride && /^Q\d+$/.test(input.qidOverride.trim())) {
      resolution = { qid: input.qidOverride.trim(), label: state.name, description: "manual override" };
    } else {
      const candidates = await resolveState(state.name);
      if (candidates.length === 0)
        return { ok: false, error: `No Wikidata item found for "${state.name}".` };
      resolution = candidates[0];
    }

    if (input.kind === "heads_of_state" && state.id !== "in") {
      return { ok: false, error: "President history applies only to India (Union)." };
    }
    if (input.kind === "cm_terms" || input.kind === "heads_of_state") {
      const terms = await fetchHeadTerms(
        resolution.qid,
        input.kind === "heads_of_state" ? "P35" : "P6",
      );
      return { ok: true, resolution, terms };
    }
    const elections = await fetchElections(
      state.name,
      state.id === "in" ? "general" : "assembly",
    );
    return { ok: true, resolution, elections };
  } catch (e) {
    return {
      ok: false,
      error: `Fetching from Wikidata failed: ${e instanceof Error ? e.message : "unknown error"}. (This is expected in offline development environments; it works on the deployed site.)`,
    };
  }
}

export type CommitResult = { ok: true; outcome: DraftOutcome } | { ok: false; error: string };

/** Create pending draft revisions from a previewed selection. */
export async function commitImport(input: {
  stateId: string;
  kind: ImportKind;
  stateQid: string;
  terms?: ImportedTerm[];
  elections?: ImportedElection[];
}): Promise<CommitResult> {
  try {
    await requireRole("admin");
  } catch (e) {
    return { ok: false, error: e instanceof AuthzError ? e.message : "Not authorized." };
  }

  const state = await db.query.states.findFirst({ where: eq(states.id, input.stateId) });
  if (!state) return { ok: false, error: "Unknown state." };

  const MAX_BATCH = 60;
  try {
    if (input.kind === "cm_terms" || input.kind === "heads_of_state") {
      const items = (input.terms ?? []).slice(0, MAX_BATCH);
      if (items.length === 0) return { ok: false, error: "Nothing selected." };
      const office =
        input.kind === "heads_of_state" ? "president" : input.stateId === "in" ? "pm" : "cm";
      const outcome = await createTermDrafts(
        input.stateId,
        state.name,
        input.stateQid,
        items,
        office,
      );
      return { ok: true, outcome };
    }
    const items = (input.elections ?? []).slice(0, MAX_BATCH);
    if (items.length === 0) return { ok: false, error: "Nothing selected." };
    const outcome = await createElectionDrafts(input.stateId, state.name, items);
    return { ok: true, outcome };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
