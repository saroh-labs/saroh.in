import { Skeleton } from "@saroh/ui/skeleton";
import { SplitShell } from "@saroh/ui/split-shell";

/**
 * The business step's shape while it loads: the split, a heading and four
 * fields — so the page does not arrive as a different layout from the one it
 * was waiting as.
 */
export default function Loading() {
    return (
        <SplitShell panel={<div aria-hidden className="h-48" />}>
            <div aria-busy="true" aria-label="Loading" className="grid gap-5">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-72" />
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="grid gap-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-[38px] w-full" />
                    </div>
                ))}
            </div>
        </SplitShell>
    );
}
