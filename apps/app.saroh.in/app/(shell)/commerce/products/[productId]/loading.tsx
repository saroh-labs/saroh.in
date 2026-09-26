import { Skeleton } from "@saroh/ui/skeleton";

/** The product page's shape while it loads (#522): header, tabs, cards. */
export default function Loading() {
    return (
        <main className="w-full" aria-busy="true">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-[9px]">
                <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
            <div
                role="status"
                aria-label="Loading the product"
                className="px-4 pb-[26px] pt-5 sm:px-[22px]"
            >
                <div
                    aria-hidden
                    className="mb-[22px] flex items-center gap-3.5"
                >
                    <Skeleton className="size-14 rounded-[10px]" />
                    <div className="flex flex-1 flex-col gap-2">
                        <Skeleton className="h-[18px] w-[38%] rounded-md" />
                        <Skeleton className="h-3 w-[60%] rounded-md" />
                    </div>
                </div>
                <div aria-hidden className="mb-5 flex gap-[18px]">
                    {[70, 110, 60, 70].map((w, i) => (
                        <Skeleton
                            key={i}
                            className="h-3 rounded-md"
                            style={{ width: w }}
                        />
                    ))}
                </div>
                <div
                    aria-hidden
                    className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5"
                >
                    {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[82px] rounded-[12px]" />
                    ))}
                </div>
                <p className="mt-4 text-[12.5px] text-muted-foreground">
                    Loading the product…
                </p>
            </div>
        </main>
    );
}
