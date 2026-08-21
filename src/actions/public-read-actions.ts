/**
 * The server actions that are deliberately callable without a session.
 *
 * Everything in src/actions is reachable by anyone on the internet the moment
 * it exports; the auth check inside the function is the only door. This list
 * is the record of which functions have NO such door on purpose, and the test
 * in actions-guarded.test.ts holds the invariant: every exported action either
 * calls requireRole, or appears here with its reason. A new action that does
 * neither fails the suite, which is the point — new actions fail closed.
 *
 * Rules for adding a name:
 *  - reads only. An unauthenticated write does not belong on this list; it
 *    belongs redesigned.
 *  - rate-limited. Public compute is bounded per caller (see lib/rate-limit),
 *    and the reason below must say which bucket bounds it.
 */
export const PUBLIC_READ_ACTIONS: Record<string, string> = {
  // Read-only graph queries behind the public network explorer. All five are
  // bounded by the "graph" rate bucket, and none takes a write path: the graph
  // has no write path at all.
  searchEntitiesAction: "entity autocomplete for the connect page; graph bucket",
  findPathsAction: "documented paths between two entities; graph bucket",
  sharedConnectionsAction: "documented overlap between two entities; graph bucket",
  expandNodeAction: "one-hop expansion of a clicked node; graph bucket",
  edgeEvidenceAction: "citations behind one drawn edge; graph bucket",
  // Anyone may report a problem with a record, signed in or not: requiring an
  // account to say "this is wrong" would filter exactly the readers most
  // likely to notice. Bounded by the "report" bucket plus a per-entity cap on
  // open reports inside the action itself.
  openReport: "public problem reports on records; report bucket + per-entity cap",
};
