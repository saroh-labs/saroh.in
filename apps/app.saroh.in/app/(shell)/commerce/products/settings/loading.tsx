import { Skeleton } from "@saroh/ui/skeleton";

import { PageContainer } from "@/components/shared/page-container";

/** Product settings' shape — title, tabs, a list — while it loads. */
export default function Loading() {
    return (
        <PageContainer width="wide">
            <div className="flex flex-col gap-5" aria-hidden>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-[30px] w-64" />
                </div>
                <div className="flex gap-3 border-b border-border pb-2.5">
                    {[90, 70, 100, 80, 50, 70].map((w, i) => (
                        <Skeleton
                            key={i}
                            className="h-4"
                            style={{ width: w }}
                        />
                    ))}
                </div>
                <Skeleton className="h-9 w-full rounded-[8px]" />
                {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[58px] rounded-[12px]" />
                ))}
            </div>
        </PageContainer>
    );
}
