import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * The Products list's shape while it loads (#519, the design's loading
 * state): the heading, the tabs and toolbar, and a table whose rows are a
 * tile and two bars — so nothing jumps when the rows arrive. No counts: an
 * unknown count is left out, never shown as 0.
 */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="flex flex-col gap-3" aria-hidden>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-[30px] w-40" />
                <div className="mt-2 flex gap-3 border-b border-border pb-2.5">
                    {[40, 90, 76, 70].map((w, i) => (
                        <Skeleton
                            key={i}
                            className="h-4"
                            style={{ width: w }}
                        />
                    ))}
                </div>
                <div className="flex flex-wrap gap-2.5 pt-0.5">
                    <Skeleton className="h-[38px] w-full max-w-[320px] rounded-[9px]" />
                    <Skeleton className="h-[38px] w-24 rounded-[9px]" />
                </div>
            </div>
            <div
                aria-busy="true"
                aria-live="polite"
                className="mt-3.5 overflow-hidden rounded-[11px] border border-border bg-card"
            >
                <span className="sr-only">Loading products</span>
                <div className="h-10 border-b border-border bg-foreground/[0.03]" />
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 border-b border-border px-3.5 py-[11px] last:border-b-0"
                    >
                        <Skeleton className="size-[17px] rounded-[5px]" />
                        <Skeleton className="size-[30px] rounded-[7px]" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-2.5 w-[60%]" />
                            <Skeleton className="h-2.5 w-[35%]" />
                        </div>
                        <Skeleton className="hidden h-2.5 w-16 sm:block" />
                        <Skeleton className="hidden h-2.5 w-[70px] sm:block" />
                        <Skeleton className="h-2.5 w-14" />
                    </div>
                ))}
            </div>
        </PageContainer>
    );
}
