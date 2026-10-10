import { Skeleton } from "@saroh/ui/skeleton";
import { SplitShell } from "@saroh/ui/split-shell";

/**
 * Root loading state, in the split every page here wears (UX audit, 10 Oct):
 * the mark, a heading, two fields and a button in the form's column, and the
 * panel's place held beside it. So the swap to the real page does not
 * reflow, and nothing arrives as a different layout from the one it was
 * waiting as. A centred spinner would tell the visitor less and move more.
 */
export default function Loading() {
    return (
        <SplitShell panel={<div aria-hidden className="h-48" />}>
            <div role="status" aria-busy="true">
                <span className="sr-only">Loading</span>
                <div aria-hidden className="grid gap-5">
                    <div className="grid gap-2">
                        <Skeleton className="h-7 w-40" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <div className="grid gap-4">
                        <Skeleton className="h-[38px] w-full" />
                        <Skeleton className="h-[38px] w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                </div>
            </div>
        </SplitShell>
    );
}
