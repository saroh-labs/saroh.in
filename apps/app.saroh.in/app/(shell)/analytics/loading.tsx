import { ListSkeleton } from "@/components/shared/list-skeleton";

/**
 * Perceived latency should not depend on which route you happened to open.
 * Eight of twelve list routes had a `loading.tsx` and four did not, so the same
 * app felt instant in some places and frozen in others for identical waits.
 */
export default function Loading() {
    return <ListSkeleton />;
}
