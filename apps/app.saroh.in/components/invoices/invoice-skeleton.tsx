import { PageContainer } from "@/components/shared/page-container";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * The Invoices designs' loading shape, for the list and one invoice alike: a
 * title, a line under it and three blocks. It says it is loading, so a
 * screen reader hears that rather than a row of empty boxes.
 */
export function InvoiceSkeleton() {
    return (
        <PageContainer width="full">
            <div
                role="status"
                aria-label="Loading"
                aria-busy
                className="grid gap-2.5 py-1"
            >
                <Skeleton className="h-[26px] w-[38%] rounded-[8px]" />
                <Skeleton className="h-3.5 w-[58%] rounded-[6px]" />
                <Skeleton className="mt-1.5 h-16 rounded-[12px]" />
                <Skeleton className="h-16 rounded-[12px]" />
                <Skeleton className="h-16 rounded-[12px]" />
            </div>
        </PageContainer>
    );
}
