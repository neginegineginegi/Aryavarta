import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_READ_ACTIONS } from "./public-read-actions";

/**
 * The invariant: every exported function in src/actions either calls
 * requireRole, or is on the PUBLIC_READ_ACTIONS list with a written reason.
 *
 * Static analysis rather than imports, because these are "use server" modules
 * that reach for the database and session at import time; parsing the source
 * keeps the test hermetic. The `typescript` package is already a dependency,
 * so this costs nothing new.
 *
 * getSessionUser deliberately does NOT count as a guard: it answers "who is
 * this, if anyone" and lets the caller proceed either way. Only requireRole
 * refuses.
 */

const ACTIONS_DIR = join(__dirname);

/** Every exported function name in a source file, with whether its own body
 *  contains a requireRole( call. */
function exportedFunctions(file: string): Array<{ name: string; guarded: boolean }> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  const out: Array<{ name: string; guarded: boolean }> = [];

  const callsRequireRole = (node: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node) => {
      if (found) return;
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "requireRole"
      ) {
        found = true;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(node);
    return found;
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      out.push({ name: node.name.text, guarded: callsRequireRole(node) });
    }
    // export const foo = async (...) => {...}
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          out.push({ name: decl.name.text, guarded: callsRequireRole(decl.initializer) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const actionFiles = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "public-read-actions.ts")
  .map((f) => join(ACTIONS_DIR, f));

describe("every server action is guarded or declared public", () => {
  it("finds the action files at all", () => {
    // If the directory moves, the suite must fail rather than pass over
    // nothing: a test that scans zero files verifies zero invariants.
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  for (const file of actionFiles) {
    const fns = exportedFunctions(file);
    for (const fn of fns) {
      it(`${file.split("/").pop()} · ${fn.name}`, () => {
        const declaredPublic = fn.name in PUBLIC_READ_ACTIONS;
        if (fn.guarded) {
          // A guarded action must not ALSO be on the public list: the list
          // would then misdescribe the surface, which is its whole job.
          expect(
            declaredPublic,
            `${fn.name} calls requireRole but is listed in PUBLIC_READ_ACTIONS; remove one`,
          ).toBe(false);
        } else {
          expect(
            declaredPublic,
            `${fn.name} has no requireRole call and is not in PUBLIC_READ_ACTIONS. ` +
              `Either guard it, or add it to the list with a reason it is safe to expose.`,
          ).toBe(true);
        }
      });
    }
  }

  it("keeps the public list free of names that no longer exist", () => {
    const all = new Set(actionFiles.flatMap((f) => exportedFunctions(f).map((x) => x.name)));
    for (const name of Object.keys(PUBLIC_READ_ACTIONS)) {
      expect(all.has(name), `${name} is listed public but exported nowhere`).toBe(true);
    }
  });
});
