import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Loading shape for Home — a stat band above ranked action blocks.
 *
 * Home is the app's landing route, so this is the first thing most sessions
 * paint. It mirrors `NumbersBand` + `NeedsYou` rather than showing generic rows,
 * because the whole point of Home is the RANKING, and a skeleton that implies a
 * flat list misrepresents the page it precedes.
 */
export function DashboardSkeleton() {
    return (
        <main
            className="mx-auto w-full max-w-5xl p-6 sm:p-8"
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="mb-6 space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-96" />
            </div>

            <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[4.75rem] rounded-md" />
                ))}
            </div>

            <Skeleton className="mb-3 h-3.5 w-24" />
            <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-md" />
                ))}
            </div>
        </main>
    );
}
