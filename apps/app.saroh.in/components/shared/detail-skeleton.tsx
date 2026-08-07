import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Loading shape for a single-record page — a lead, order, product, site.
 *
 * Detail pages are a title plus stacked panels, not rows, so `ListSkeleton`
 * would promise the wrong thing: the eye settles on a list rhythm and then has
 * to re-read the page when panels arrive instead. Shaped skeletons are only
 * worth having if they are actually the right shape.
 */
export function DetailSkeleton({
    panels = 3,
    maxWidth = "max-w-3xl",
}: {
    panels?: number;
    maxWidth?: string;
}) {
    return (
        <main
            className={cn("mx-auto w-full p-6 sm:p-8", maxWidth)}
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="mb-6 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-80" />
            </div>
            <div className="space-y-4">
                {Array.from({ length: panels }).map((_, i) => (
                    <div
                        key={i}
                        className="space-y-3 rounded-lg border border-border p-4"
                    >
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/5" />
                    </div>
                ))}
            </div>
        </main>
    );
}
