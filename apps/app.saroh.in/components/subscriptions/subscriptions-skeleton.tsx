import { Skeleton } from "@saroh/ui/skeleton";

import { PaymentsCrumbs } from "./payments-crumbs";

/**
 * The design's loading shape for both Subscriptions screens: a title, a
 * line, and three cards where the rows or panels will be.
 */
export function SubscriptionsSkeleton({
    here,
    back,
}: {
    here: string;
    back?: { href: string; label: string };
}) {
    return (
        <>
            <PaymentsCrumbs here={here} back={back} />
            <div
                role="status"
                aria-busy="true"
                aria-label="Loading"
                className="grid gap-2.5 px-6 py-5"
            >
                <Skeleton className="h-[26px] w-[38%] rounded-[8px]" />
                <Skeleton className="h-3.5 w-[58%] rounded-[6px]" />
                <Skeleton className="mt-1.5 h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
            </div>
        </>
    );
}
