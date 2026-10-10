import { Skeleton } from "@saroh/ui/skeleton";

/**
 * Loading skeleton for Settings › Share, in the shape of the page below:
 * the heading, the maker's three columns (the cards and pills, the code,
 * the look and its buttons), then the list. The same grid as the maker, so
 * the columns stack on a phone exactly as they will when it lands.
 */
export default function Loading() {
    return (
        <main
            aria-busy="true"
            aria-label="Loading Share"
            className="w-full space-y-4 px-4 pb-[26px] pt-5 sm:px-[26px]"
        >
            <div className="space-y-2" aria-hidden>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="max-w-[1232px] space-y-5" aria-hidden>
                <Skeleton className="h-5 w-28" />
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
                    <div className="flex flex-col gap-2.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-[62px] rounded-xl" />
                        <Skeleton className="h-[62px] rounded-xl" />
                        <Skeleton className="h-[62px] rounded-xl" />
                        <Skeleton className="mt-2.5 h-3 w-24" />
                        <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-[34px] w-20 rounded-full" />
                            <Skeleton className="h-[34px] w-16 rounded-full" />
                            <Skeleton className="h-[34px] w-28 rounded-full" />
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-border bg-card px-5 py-7">
                        <Skeleton className="aspect-square w-full max-w-[280px]" />
                        <Skeleton className="h-10 w-40 rounded-full" />
                        <Skeleton className="h-4 w-44" />
                    </div>
                    <div className="flex flex-col gap-[18px]">
                        <Skeleton className="h-[42px] rounded-[10px]" />
                        <div className="flex gap-2.5">
                            <Skeleton className="size-[34px] rounded-full" />
                            <Skeleton className="size-[34px] rounded-full" />
                            <Skeleton className="size-[34px] rounded-full" />
                            <Skeleton className="size-[34px] rounded-full" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-[34px] w-28 rounded-full" />
                            <Skeleton className="h-[34px] w-28 rounded-full" />
                        </div>
                        <div className="flex gap-2">
                            <Skeleton className="h-10 w-36 rounded-[10px]" />
                            <Skeleton className="h-10 w-16 rounded-[10px]" />
                        </div>
                    </div>
                </div>
                <Skeleton className="mt-3 h-5 w-36" />
                <Skeleton className="h-[148px] rounded-[14px]" />
            </div>
        </main>
    );
}
