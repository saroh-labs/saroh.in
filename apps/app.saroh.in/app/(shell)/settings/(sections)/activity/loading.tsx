import { ListSkeleton } from "@/components/shared/list-skeleton";

/**
 * Loading skeleton for Settings → Activity: a heading and a column of change
 * lines, the shape the page below is, as the other settings tabs draw theirs.
 */
export default function Loading() {
    return <ListSkeleton rows={6} />;
}
