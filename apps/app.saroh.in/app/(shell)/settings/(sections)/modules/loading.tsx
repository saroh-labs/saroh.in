import { ListSkeleton } from "@/components/shared/list-skeleton";

/**
 * Loading skeleton for Settings → Modules: a list of rows, the shape the
 * page below is (it was a grid of cards once, and the skeleton kept it).
 */
export default function Loading() {
    return <ListSkeleton rows={6} />;
}
