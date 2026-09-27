import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Loading shape for Home — the greeting, then the ranked rows of Needs you.
 *
 * Home is the app's landing route, so this is the first thing most sessions
 * paint. It mirrors `HomeHeader` + `NeedsYou` rather than showing generic
 * rows, because the whole point of Home is the RANKING, and a skeleton that
 * implies a grid of tiles misrepresents the page it precedes.
 */
export function DashboardSkeleton() {
    return (
        <main
            className="mx-auto w-full max-w-5xl p-6 sm:p-8"
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="mb-5 space-y-2">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-80" />
            </div>

            <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[58px] w-full rounded-xl" />
                ))}
            </div>
        </main>
    );
}
