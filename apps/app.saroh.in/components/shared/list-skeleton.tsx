import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Shared list-page loading skeleton (header + rows), used by per-segment
 * `loading.tsx` files so a slow segment shows a shape that matches the page it's
 * about to render — instead of the generic app-root skeleton or a frozen route.
 * Built on the @saroh/ui `Skeleton` primitive.
 */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <main className="mx-auto max-w-5xl p-8" aria-busy="true">
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
