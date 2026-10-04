import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * Insights on its way, in the page's own shape (DEC-075): the heading, the
 * answers card and the figures card at the page's width, then the
 * website's tiles — so nothing jumps when the figures arrive. The rows come
 * from the shared `LoadingState`, which carries `aria-busy` and the label.
 */
export default function Loading() {
    return (
        <PageContainer width="wide">
            <div className="space-y-2" aria-hidden>
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-6 w-28" aria-hidden />
                <LoadingState
                    rows={3}
                    variant="list"
                    label="Loading takings"
                    className="rounded-[14px]"
                />
                <div
                    aria-hidden
                    className="rounded-[14px] border border-border px-[19px] py-[18px]"
                >
                    <div className="mb-4 grid grid-cols-2 gap-[11px] md:grid-cols-4">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton
                                key={i}
                                className="h-[76px] rounded-[11px]"
                            />
                        ))}
                    </div>
                    <Skeleton className="h-24 w-full md:h-40" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-[11px]" aria-hidden>
                {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-[72px] rounded-[11px]" />
                ))}
            </div>
        </PageContainer>
    );
}
