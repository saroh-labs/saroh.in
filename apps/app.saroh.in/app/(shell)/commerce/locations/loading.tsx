import { DetailSkeleton } from "@/components/shared/detail-skeleton";

/**
 * A location is a title and stacked cards (The place, Payments, Delivery…),
 * not rows, so it loads in that shape rather than Sell's list skeleton.
 */
export default function Loading() {
    return <DetailSkeleton panels={4} maxWidth="max-w-3xl" />;
}
