import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Root loading state. Shaped like the auth card every route here renders — a
 * heading, two fields and a button — so the swap to the real form does not
 * reflow the page. A centred spinner would tell the visitor less and move
 * more.
 */
export default function Loading() {
    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
            <div className="space-y-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        </main>
    );
}
