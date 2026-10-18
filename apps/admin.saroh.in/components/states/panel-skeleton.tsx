import { Card, CardContent, CardHeader } from "@saroh/ui/card";
import { LoadingState } from "@saroh/ui/data-state";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * A console panel on its way: the `Panel`'s own frame, a bar where its
 * title goes and the shared list skeleton for its body, so nothing moves
 * when it arrives. One sentence for a screen reader (`label`, "Loading
 * {things}"); the grey is hidden from it.
 */
export function PanelSkeleton({
    label,
    rows = 3,
    variant = "list",
}: {
    /** What is loading, read out: "Loading businesses". */
    label: string;
    rows?: number;
    variant?: "list" | "plain";
}) {
    return (
        <Card className="min-w-0" role="status" aria-busy="true">
            <CardHeader aria-hidden>
                <Skeleton className="h-4 w-40 rounded-[4px]" />
            </CardHeader>
            <CardContent className="min-w-0">
                <LoadingState label={label} rows={rows} variant={variant} />
            </CardContent>
        </Card>
    );
}
