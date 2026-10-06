import { Skeleton } from "@saroh/ui/skeleton";

/**
 * While `GET /admin/pricing` is on its way: the bar, the tab row and a panel
 * in their own shapes, and no status bar until the status is known, so the
 * screen never flashes "Live" before saying "Draft".
 */
export function PlansSkeleton() {
    return (
        <div aria-busy="true" aria-live="polite" className="grid gap-4">
            <span className="sr-only">Loading plans and modules</span>
            <Skeleton className="h-[50px] rounded-[12px]" />
            <div className="flex gap-2 border-b border-border pb-2">
                {[56, 72, 52, 84, 120].map((w) => (
                    <Skeleton key={w} className="h-5" style={{ width: w }} />
                ))}
            </div>
            <Skeleton className="h-[420px] rounded-[14px]" />
        </div>
    );
}
