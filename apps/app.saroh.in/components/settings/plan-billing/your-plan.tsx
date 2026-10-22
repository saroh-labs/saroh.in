import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import Link from "next/link";
import { Fragment } from "react";

import { ChangePaymentMethod } from "@/components/settings/change-payment-method";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { NextCharge } from "@/lib/saroh-billing/plan";
import type { StatusPart } from "@/lib/saroh-billing/plan-status";
import { nextParts, planMessage } from "@/lib/saroh-billing/plan-status";
import type {
    CancelOffer,
    PendingCheckout,
    PlanNote,
} from "@/lib/saroh-billing/plan-view";

import { CancelPlan } from "./cancel-plan";
import { CheckoutPending } from "./checkout-pending";
import { PLANS_HREF } from "./styles";

/** The section's shape, from the catalogue (`yourPlan`) or a legacy row (`planSummary`). */
export interface YourPlanProps {
    name: string;
    price: string | null;
    freeUntil?: string | null;
    /** A line under the status: a legacy plan's contents, or the pricing version it's on. */
    includes: string;
    next: NextCharge;
    /** What follows "You're on ‹plan›"; left out, it is read off `next`. */
    status?: StatusPart[];
    method: string | null;
    footnote: string;
    notes?: PlanNote[];
    warning?: string | null;
    /** A plan change waiting for its payment (DEC-093). */
    pending?: PendingCheckout | null;
    /**
     * `billing:manage`. Without it the section is read: no change of payment
     * method, no way into a plan change and no payment to carry on.
     */
    canChange?: boolean;
    /**
     * "Cancel plan" (owner, 17 Oct 2026): offered on a paid plan the
     * business isn't already leaving; shown only with `canChange`.
     */
    cancel?: CancelOffer | null;
}

/** Where a note's action goes: Change plan, with its plan's change open. */
export function changeHref(planId: string, cycle: string) {
    return `${PLANS_HREF}?${new URLSearchParams({ plan: planId, cycle }).toString()}`;
}

/** A note's words, around its one date. */
export function NoteWords({ note }: { note: PlanNote }) {
    return (
        <>
            {note.lead}
            {note.iso ? <ViewerDate iso={note.iso} /> : null}
            {note.tail}
        </>
    );
}

/**
 * "Your plan" (owner, 13 Oct 2026): ONE status line that is always there,
 * the plan and what happens next ("You're on Plan B · First month until
 * ‹date› · then ‹amount› a month"), with how it's paid under it; then at
 * most ONE message, only when something needs the business (`planMessage`:
 * a payment under way or failed first, then a plan change on its way, then
 * any other warning). What is true but asks nothing (the first month's
 * small print, how many charges its autopay covers) is behind "How billing
 * works", under the plans. The line about last month is the foot, left
 * out until there is such a summary (UX-080). On a paid plan it isn't
 * already leaving, the owner has "Cancel plan" under the status (17 Oct
 * 2026); once cancelled, the status line says when it ends.
 */
export function YourPlan(props: YourPlanProps) {
    const { canChange = true } = props;
    const status =
        props.status ?? nextParts(props.next, { price: props.price });
    const { message } = planMessage({
        notes: props.notes ?? [],
        warning: props.warning,
        pending: Boolean(props.pending && canChange),
    });
    return (
        <section aria-label="Your plan" className="grid gap-3">
            <div className="grid gap-1.5">
                <h2 className="label">Your plan</h2>
                {/* One line where there is room for it. Each fact is kept
                    whole: a line breaks after a dot, never inside "then
                    ‹amount› a month". On a phone the plan is one line and
                    each fact its own, by design. */}
                <p className="text-[15px] leading-normal text-foreground/80">
                    <span className="font-display text-[19px] font-semibold tracking-[-0.01em] text-foreground max-desk:block">
                        You&apos;re on {props.name}
                    </span>
                    {status.map((part) => (
                        <Fragment key={`${part.lead}${part.iso ?? ""}`}>
                            <span className="max-desk:hidden">
                                {"\u00a0· "}
                            </span>
                            <span className="inline-block max-desk:block">
                                {part.lead}
                                {part.iso ? (
                                    <ViewerDate iso={part.iso} />
                                ) : null}
                                {part.tail}
                            </span>
                        </Fragment>
                    ))}
                </p>
                {props.method ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground/80">
                        {props.method}
                        {canChange ? <ChangePaymentMethod /> : null}
                    </p>
                ) : null}
                {props.includes ? (
                    <p className="text-pretty text-[13px] text-foreground/80">
                        {props.includes}
                    </p>
                ) : null}
            </div>
            {props.cancel && canChange ? (
                <CancelPlan offer={props.cancel} />
            ) : null}
            {message === "pending" && props.pending ? (
                <CheckoutPending pending={props.pending} />
            ) : message && message !== "pending" ? (
                <Notice
                    tone={message.tone === "attention" ? "warning" : "neutral"}
                    role="note"
                    align="center"
                    action={
                        message.action && canChange ? (
                            <Button asChild size="sm" variant="outline">
                                <Link
                                    href={changeHref(
                                        message.action.planId,
                                        message.action.cycle,
                                    )}
                                >
                                    {message.action.label}
                                </Link>
                            </Button>
                        ) : undefined
                    }
                >
                    <p className="text-pretty font-medium">
                        <NoteWords note={message} />
                    </p>
                </Notice>
            ) : null}
            {props.footnote ? (
                <p className="text-pretty text-[13px] text-foreground/80">
                    {props.footnote}
                </p>
            ) : null}
        </section>
    );
}
