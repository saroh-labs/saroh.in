import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { CircleAlert, Info } from "lucide-react";
import Link from "next/link";

import { ChangePaymentMethod } from "@/components/settings/change-payment-method";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { NextCharge } from "@/lib/saroh-billing/plan";
import type { PendingCheckout, PlanNote } from "@/lib/saroh-billing/plan-view";

import { CheckoutPending } from "./checkout-pending";
import { card } from "./styles";

/** The card's shape, from the catalogue (`yourPlan`) or a legacy row (`planSummary`). */
export interface YourPlanProps {
    name: string;
    price: string | null;
    freeUntil?: string | null;
    includes: string;
    next: NextCharge;
    method: string | null;
    footnote: string;
    notes?: PlanNote[];
    warning?: string | null;
    /** A plan change waiting for its payment (DEC-093). */
    pending?: PendingCheckout | null;
}

/** Where a note's action goes: the picker, with its plan's change open. */
function changeHref(planId: string, cycle: string) {
    return `/settings/billing?${new URLSearchParams({ plan: planId, cycle }).toString()}#change-plan`;
}

/**
 * "Your plan" ("Saroh Settings" design): the plan, its price, what it's
 * for, the next charge and how it's paid; then anything under way (a move
 * on a date, a payment to authorise, a plan given for a while, the term and
 * its renewal, a checkout waiting for its payment), and the line about last
 * month along the foot — left out until there is such a summary (UX-080).
 */
export function YourPlan(props: YourPlanProps) {
    const { next } = props;
    return (
        <section aria-label="Your plan" className={card}>
            <div className="flex flex-wrap items-start gap-3.5 px-[18px] py-4">
                <div className="min-w-0 flex-[1_1_260px]">
                    <p className="text-[12px] text-muted-foreground">
                        Your plan
                    </p>
                    <p className="mt-0.5 font-display text-[24px] font-semibold tracking-[-0.02em]">
                        {props.name}{" "}
                        {props.price ? (
                            <span className="text-[15px] font-medium text-foreground/80">
                                {props.price}
                            </span>
                        ) : props.freeUntil ? (
                            <span className="text-[15px] font-medium text-foreground/80">
                                free until <ViewerDate iso={props.freeUntil} />
                            </span>
                        ) : null}
                    </p>
                    {props.includes ? (
                        <p className="mt-1 text-pretty text-[13px] text-foreground/80">
                            {props.includes}
                        </p>
                    ) : null}
                </div>
                <div className="flex-[0_1_auto] sm:text-right">
                    <p className="text-[12px] text-muted-foreground">
                        Next charge
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold">
                        {next.kind === "charge" ? (
                            <>
                                <ViewerDate iso={next.iso} /> · {next.amount}
                            </>
                        ) : next.kind === "ends" ? (
                            <>
                                Ends <ViewerDate iso={next.iso} />
                            </>
                        ) : next.kind === "paidTo" ? (
                            <>
                                Paid to <ViewerDate iso={next.iso} />
                            </>
                        ) : (
                            next.text
                        )}
                    </p>
                    {props.method ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground sm:justify-end">
                            {props.method}
                            <ChangePaymentMethod />
                        </p>
                    ) : null}
                </div>
            </div>
            {props.warning ? (
                <p
                    role="note"
                    className="flex items-start gap-2 border-t border-border/70 px-[18px] py-3 text-[13px] font-medium"
                >
                    <CircleAlert
                        aria-hidden
                        className="mt-px size-4 shrink-0"
                    />
                    {props.warning}
                </p>
            ) : null}
            {(props.notes ?? []).map((n) => (
                <div
                    key={`${n.lead}${n.iso ?? ""}`}
                    role="note"
                    className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-[18px] py-3 text-[13px]",
                        n.tone === "attention" &&
                            "bg-warning-subtle text-warning-subtle-foreground",
                    )}
                >
                    <p className="flex min-w-0 flex-[1_1_260px] items-start gap-2 text-pretty font-medium">
                        {n.tone === "attention" ? (
                            <CircleAlert
                                aria-hidden
                                className="mt-px size-4 shrink-0"
                            />
                        ) : (
                            <Info
                                aria-hidden
                                className="mt-px size-4 shrink-0"
                            />
                        )}
                        <span>
                            {n.lead}
                            {n.iso ? <ViewerDate iso={n.iso} /> : null}
                            {n.tail}
                        </span>
                    </p>
                    {n.action ? (
                        <Button asChild size="sm" variant="outline">
                            <Link
                                href={changeHref(
                                    n.action.planId,
                                    n.action.cycle,
                                )}
                            >
                                {n.action.label}
                            </Link>
                        </Button>
                    ) : null}
                </div>
            ))}
            {props.pending ? <CheckoutPending pending={props.pending} /> : null}
            {props.footnote ? (
                <p className="text-pretty border-t border-border/70 bg-muted/50 px-[18px] py-3 text-[13px] text-foreground/80">
                    {props.footnote}
                </p>
            ) : null}
        </section>
    );
}
