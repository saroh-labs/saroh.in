import { LoadingState } from "@saroh/ui/data-state";
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
        <main className={cn("mx-auto w-full p-6 sm:p-8", maxWidth)}>
            {/* The page heading, which is a shape this component knows and the
                shared primitive does not. */}
            <div className="mb-6 space-y-2" aria-hidden>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>
            {/* The rows come from the shared `LoadingState` (#177) so there is
                ONE loading treatment rather than two that drift: it carries the
                `aria-busy` and the announced label, so a screen reader is told
                this is arriving instead of being read a wall of empty boxes. */}
            <LoadingState rows={rows} className="gap-3 [&>*]:h-20" />
        </main>
    );
}
