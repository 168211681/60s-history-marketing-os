import Link from "next/link";
import { Panel } from "@/components/ui";
import { ReviewQueue, ReviewQueueHeading, ReviewQueueUnavailable } from "@/components/review-queue";
import { currentOwner } from "@/lib/auth/server";
import { databaseConfigured } from "@/lib/database";
import { parseReviewFilters, type ReviewParams } from "@/lib/clipforge/review-queue";
import { getReviewQueue } from "@/lib/clipforge/review-queue-store";

export const metadata = { title: "Metadata review queue" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<ReviewParams> }) {
  const owner = await currentOwner();
  if (!owner) return <><ReviewQueueHeading /><Panel title="Review queue is private">
    <p>Sign in as the channel owner to inspect metadata suggestions. <Link href="/settings">Open settings →</Link></p>
  </Panel></>;
  if (!databaseConfigured()) return <ReviewQueueUnavailable />;
  const filters = parseReviewFilters(await searchParams);
  if (!filters) return <ReviewQueueUnavailable invalid />;
  const data = await getReviewQueue(owner.id, filters).catch(() => null);
  return data ? <ReviewQueue filters={filters} data={data} /> : <ReviewQueueUnavailable />;
}
