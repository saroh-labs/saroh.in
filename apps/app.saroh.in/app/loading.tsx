import { Skeleton } from "@saroh/ui/skeleton";

/**
 * App-root loading skeleton. Rendered by Next for any segment that suspends and
 * lacks its own loading.tsx, so a slow route shows a skeleton (built on the
 * @saroh/ui `Skeleton` primitive) instead of a blank/frozen page.
 */
export default function Loading() {
    return (
        <main className="mx-auto max-w-5xl p-8" aria-busy="true">
            <Skeleton className="mb-6 h-8 w-48" />
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
            </div>
        </main>
    );
}
