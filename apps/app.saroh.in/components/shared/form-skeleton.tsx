import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Loading shape for a create/edit page.
 *
 * Label-then-field pairs, so the page the merchant is about to fill in is
 * already legible as a form before its inputs exist. The trailing button block
 * matters more than it looks: without it the submit control appears out of
 * nowhere at the end, which is exactly when someone is deciding whether the
 * page has finished loading.
 */
export function FormSkeleton({
    fields = 4,
    maxWidth = "max-w-2xl",
}: {
    fields?: number;
    maxWidth?: string;
}) {
    return (
        <main
            className={cn("mx-auto w-full p-6 sm:p-8", maxWidth)}
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="mb-6 space-y-2">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-80" />
            </div>
            <div className="space-y-5">
                {Array.from({ length: fields }).map((_, i) => (
                    <div key={i} className="space-y-2">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                ))}
                <Skeleton className="h-10 w-40 rounded-md" />
            </div>
        </main>
    );
}
