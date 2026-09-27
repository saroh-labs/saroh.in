import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * The Customers list's shape while it loads (C4): the heading, the search
 * and chips, and a table of rows that are two bars and two figures — so
 * nothing jumps when the rows arrive. No counts: an unknown count is left
 * out, never shown as 0.
 */
export default function Loading() {
    return (
        <PageContainer width="full">
            <div className="max-w-[1100px]">
                <div className="flex flex-col gap-3" aria-hidden>
                    <Skeleton className="h-[30px] w-40" />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-[34px] w-full max-w-[420px] rounded-[9px]" />
                        <Skeleton className="h-[34px] w-36 rounded-[9px]" />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {[52, 96, 104, 100, 138, 124].map((w, i) => (
                            <Skeleton
                                key={i}
                                className="h-[30px] rounded-full"
                                style={{ width: w }}
                            />
                        ))}
                    </div>
                </div>
                <div
                    aria-busy="true"
                    aria-live="polite"
                    className="mt-3.5 overflow-hidden rounded-[12px] border border-border bg-card"
                >
                    <span className="sr-only">Loading customers</span>
                    <div className="h-[34px] border-b border-border bg-neutral-50 dark:bg-muted" />
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 border-b border-border/60 px-4 py-[13px] last:border-b-0"
                        >
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <Skeleton className="h-2.5 w-[45%]" />
                                <Skeleton className="h-2.5 w-[30%]" />
                            </div>
                            <Skeleton className="hidden h-2.5 w-20 sm:block" />
                            <Skeleton className="hidden h-2.5 w-8 sm:block" />
                            <Skeleton className="h-2.5 w-14" />
                        </div>
                    ))}
                </div>
            </div>
        </PageContainer>
    );
}
