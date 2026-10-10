import { ListSkeleton } from "@/components/shared/list-skeleton";

/** Loading skeleton for Settings → Your data: a card and a short list. */
export default function Loading() {
    return <ListSkeleton rows={3} />;
}
