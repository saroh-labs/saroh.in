import { Skeleton } from "@saroh/ui/skeleton";

/**
 * The Service Editor arriving (E2): the design's loading shape — the crumbs
 * bar, the title, its status line and the first section — so nothing jumps
 * when the page lands.
 */
export function ServiceEditorSkeleton() {
    return (
        <main className="w-full" aria-busy>
            <div className="border-b border-border px-3.5 py-[9px]">
                <Skeleton className="h-[14px] w-40" />
            </div>
            <div
                role="status"
                aria-label="Loading"
                className="grid gap-2.5 px-6 py-5 max-[759px]:px-4"
            >
                <Skeleton className="h-[26px] w-[38%] rounded-[8px]" />
                <Skeleton className="h-[14px] w-[58%] rounded-[6px]" />
                <Skeleton className="h-[120px] rounded-[12px]" />
            </div>
        </main>
    );
}
