import { Skeleton } from "@saroh/ui/skeleton";

/** The order's shape while it arrives: number, one line, then three panels. */
export default function Loading() {
    return (
        <div
            role="status"
            aria-label="Loading the order"
            className="grid gap-2.5 px-4 py-5 sm:px-6"
        >
            <Skeleton className="h-[26px] w-[38%] rounded-lg" />
            <Skeleton className="h-3.5 w-[58%] rounded-md" />
            <Skeleton className="mt-1.5 h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
        </div>
    );
}
