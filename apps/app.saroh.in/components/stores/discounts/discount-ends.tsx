import { Badge } from "@saroh/ui/badge";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { Discount } from "@/lib/discounts/service";

/**
 * When a code runs, and so its state, in one phrase (finding 26): "Live
 * until 31 Dec", "Starts 1 Dec", "Ended 25 Nov", "Used up" — never a date
 * beside a state that says the same thing.
 */
export function DiscountEnds({
    discount: d,
}: {
    discount: Pick<Discount, "state" | "startsAt" | "endsAt">;
}) {
    if (d.state === "EXHAUSTED") return <span data-ph-unmask="">Used up</span>;
    if (d.state === "EXPIRED") {
        return d.endsAt ? (
            <span>
                Ended <ViewerDate iso={d.endsAt} />
            </span>
        ) : (
            <span data-ph-unmask="">Ended</span>
        );
    }
    if (d.state === "SCHEDULED") {
        return d.startsAt ? (
            <span>
                Starts <ViewerDate iso={d.startsAt} />
            </span>
        ) : (
            <span data-ph-unmask="">Scheduled</span>
        );
    }
    return (
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <Badge variant="success">Live</Badge>
            {d.endsAt ? (
                <span>
                    until <ViewerDate iso={d.endsAt} />
                </span>
            ) : (
                <span data-ph-unmask="" className="text-muted-foreground">
                    no end date
                </span>
            )}
        </span>
    );
}
