import { Skeleton } from "@saroh/ui/skeleton";
import { SplitShell } from "@saroh/ui/split-shell";

/**
 * Setup's first step while it loads: the split, the line above the
 * heading, the question and its sentence, three full-width choices, then
 * the progress bar and the step's button at the foot, so the page does not
 * arrive as a different layout from the one it was waiting as.
 */
export default function Loading() {
    return (
        <SplitShell panel={<div aria-hidden className="h-48" />}>
            <div role="status" aria-busy="true">
                <span className="sr-only">Loading</span>
                <div aria-hidden>
                    <Skeleton className="mb-3 h-3 w-20" />
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="mb-7 mt-2 h-4 w-full" />
                    <div className="grid gap-2.5">
                        {Array.from({ length: 3 }, (_, i) => (
                            <Skeleton key={i} className="h-[60px] w-full" />
                        ))}
                    </div>
                    <Skeleton className="mt-9 h-1 w-full" />
                    <div className="mt-4 flex sm:justify-end">
                        <Skeleton className="h-[38px] w-full sm:w-[9.5rem]" />
                    </div>
                </div>
            </div>
        </SplitShell>
    );
}
