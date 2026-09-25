import { PageContainer } from "@/components/shared/page-container";

/**
 * The design's loading state: the header's shape and four tiles, so nothing
 * jumps when the customer lands. Without it the App Router holds the
 * previous page until the read resolves.
 */
export default function Loading() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <div
                role="status"
                aria-label="Loading the customer"
                className="px-[26px] pb-[26px] pt-5"
            >
                <div className="mb-3 h-3 w-40 rounded-md bg-muted" />
                <div className="flex items-center gap-3.5">
                    <div className="size-[52px] rounded-full bg-muted" />
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="h-[18px] w-[34%] rounded-md bg-muted" />
                        <div className="h-3 w-[52%] rounded-md bg-muted" />
                    </div>
                </div>
                <div className="mt-[22px] grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))]">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-[78px] rounded-xl bg-muted" />
                    ))}
                </div>
                <p className="mt-3.5 text-[12.5px] text-muted-foreground">
                    Loading the customer…
                </p>
            </div>
        </PageContainer>
    );
}
