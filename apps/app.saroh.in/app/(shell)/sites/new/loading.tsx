import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * Segment loading state. Without a `loading.tsx` this route has no Suspense
 * boundary, so the App Router holds the PREVIOUS page on screen until the
 * server render resolves. Its shape is the page's: the heading, the two
 * fields, the template cards (U12) and the button, at the form's width, so
 * nothing jumps when the real content lands.
 */
export default function Loading() {
    return (
        <PageContainer width="form">
            <div
                aria-busy="true"
                aria-label="Loading"
                className="flex flex-col gap-5"
            >
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-5 w-72 max-w-full" />
                </div>
                <div className="grid max-w-md gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="overflow-hidden rounded-lg border border-border"
                        >
                            <Skeleton className="aspect-video w-full rounded-none" />
                            <div className="flex flex-col gap-2 p-3">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
                <Skeleton className="h-10 w-32 rounded-md" />
            </div>
        </PageContainer>
    );
}
