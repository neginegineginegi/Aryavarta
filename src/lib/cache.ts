/**
 * Cache tag helpers. Every cached read declares one of these tags; the
 * approval flow revalidates the matching tags after its transaction commits.
 */
export const tags = {
  mapData: "map-data",
  state: (stateId: string) => `state:${stateId}`,
  event: (eventId: string) => `event:${eventId}`,
  election: (electionId: string) => `election:${electionId}`,
} as const;
