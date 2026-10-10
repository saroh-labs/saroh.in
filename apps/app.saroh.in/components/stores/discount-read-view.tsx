import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { ViewerDate } from "@/components/shared/viewer-date";
import { readOnlyLine } from "@/components/shared/who-can-change";
import { reachOf, ruleOf } from "@/lib/discounts/describe";
import type { Discount, DiscountState } from "@/lib/discounts/service";

const STATE: Record<DiscountState, string> = {
    ACTIVE: "Live",
    SCHEDULED: "Scheduled",
    EXPIRED: "Ended",
    EXHAUSTED: "Ended (used up)",
};

/**
 * One code, for someone who may read discounts but not change them
 * (`discount:read` without `discount:write`).
 *
 * The list links every row here, and this used to be the form: every field
 * could be typed in and Save was refused. It is the code's facts as text
 * now, with no input and no button but the way back, under the note that
 * says who can change it.
 */
export function DiscountReadView({ discount }: { discount: Discount }) {
    return (
        <div className="space-y-4">
            <ReadOnlyNote className="mb-0">
                {readOnlyLine("this code")}
            </ReadOnlyNote>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                <Row label="State">
                    <Badge
                        variant={
                            discount.state === "ACTIVE"
                                ? "success"
                                : discount.state === "SCHEDULED"
                                  ? "warning"
                                  : "neutral"
                        }
                    >
                        {STATE[discount.state]}
                    </Badge>
                </Row>
                <Row label="Takes off">{ruleOf(discount)}</Row>
                <Row label="Works on">{reachOf(discount)}</Row>
                {discount.description ? (
                    <Row label="Note">{discount.description}</Row>
                ) : null}
                <Row label="Starts">
                    {discount.startsAt ? (
                        <ViewerDate iso={discount.startsAt} />
                    ) : (
                        "Straight away"
                    )}
                </Row>
                <Row label="Ends">
                    {discount.endsAt ? (
                        <ViewerDate iso={discount.endsAt} />
                    ) : (
                        "No end date"
                    )}
                </Row>
                <Row label="Used">
                    <span className="tabular-nums">
                        {discount.usageLimit === null
                            ? `${discount.used}, with no cap`
                            : `${discount.used} of ${discount.usageLimit}`}
                    </span>
                </Row>
            </dl>
            <Button asChild variant="outline">
                <Link href="/commerce/discounts">Back to Discounts</Link>
            </Button>
        </div>
    );
}

function Row({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{children}</dd>
        </div>
    );
}
