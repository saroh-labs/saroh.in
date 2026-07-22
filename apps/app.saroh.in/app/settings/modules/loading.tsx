import { Skeleton } from "@saroh/ui/skeleton";

/** Loading skeleton for Settings → Modules. */
export default function Loading() {
    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="mb-8 space-y-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 w-full rounded-xl" />
                ))}
            </div>
        </main>
    );
}
