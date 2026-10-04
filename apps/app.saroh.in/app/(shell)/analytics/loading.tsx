import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/**
 * Insights on its way, in the page's own shape (DEC-075): the heading, the
 * answers card and the figures card in the takings column, then the
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
            <div className="max-w-2xl space-y-4">
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
                    <div className="mb-4 grid grid-cols-2 gap-[11px]">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton
                                key={i}
                                className="h-[76px] rounded-[11px]"
                            />
                        ))}
                    </div>
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
                {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
            </div>
        </PageContainer>
    );
}
