import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Shared list-page loading skeleton (header + rows), used by per-segment
 * `loading.tsx` files so a slow segment shows a shape that matches the page it's
 * about to render — instead of the generic app-root skeleton or a frozen route.
 * Built on the @saroh/ui `Skeleton` primitive.
 *
 * `maxWidth` exists because the list pages are not all the same width (they run
 * from `max-w-4xl` to `max-w-7xl`). A skeleton that is wider or narrower than
 * the page it precedes makes the content visibly jump sideways the moment it
 * arrives, which is worse than no skeleton at all — so each `loading.tsx`
 * passes the width its own page uses.
 */
export function ListSkeleton({
    rows = 5,
    maxWidth = "max-w-5xl",
}: {
    rows?: number;
    maxWidth?: string;
}) {
    return (
        <main
            className={cn("mx-auto w-full p-6 sm:p-8", maxWidth)}
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="mb-6 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: rows }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
            </div>
        </main>
    );
}
