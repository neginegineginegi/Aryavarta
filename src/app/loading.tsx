import { PageLoading } from "@/components/ui/States";

/**
 * The root loading boundary. Every route that does not declare its own falls
 * back to this, which until now meant a blank frame between navigations on
 * pages that run real queries.
 */
export default function Loading() {
  return <PageLoading label="Loading the record" />;
}
