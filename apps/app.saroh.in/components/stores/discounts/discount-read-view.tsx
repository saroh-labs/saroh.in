import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { reachOf, ruleOf, usageWords } from "@/lib/discounts/describe";
import type { Discount } from "@/lib/discounts/service";

import { DiscountEnds } from "./discount-ends";

/**
 * One code, read first (DEC-267; owner rule: read-first rows, edit on
 * request). Opening a code used to land in its form, where an ended code
 * was a keystroke and a Save from changing by accident, and nothing said
 * whether it worked. It leads with that now: the orders it was used on,
 * what it took off and what those orders came to (the API sends the last
 * only to a role that reads orders' money), then its facts, then Edit —
 * for whoever may change it (`discount:write`). Anyone else gets the note
 * that says who can.
 */
export function DiscountReadView({
    discount,
    editHref = null,
}: {
    discount: Discount;
    /** Where Edit opens the form; null for someone who can't change it. */
    editHref?: string | null;
}) {
    const usage = usageWords(discount);
    return (
        <div className="space-y-4">
            {editHref ? null : (
                <ReadOnlyNote className="mb-0">
                    {readOnlyLine("this code")}
                </ReadOnlyNote>
            )}
            <section aria-label="How it has done" className="space-y-1">
                <p className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    {usage.lead}
                </p>
                <p className="text-[13px] text-muted-foreground">
                    {usage.orders ? <>{usage.orders} · </> : null}
                    <DiscountEnds discount={discount} />
                </p>
            </section>
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
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
            <div className="flex flex-wrap gap-2">
                {editHref ? (
                    <Button asChild>
                        <IntentLink href={editHref}>Edit</IntentLink>
                    </Button>
                ) : null}
                <Button asChild variant="outline">
                    <IntentLink href="/commerce/discounts">
                        Back to Discounts
                    </IntentLink>
                </Button>
            </div>
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
