"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import { useId } from "react";

import { CheckRow } from "@/components/shared/fields/check-row";
import { RadioCards } from "@/components/shared/fields/choice-group";
import { CANT_TAKE_PAYMENTS } from "@/lib/organizations/permits";
import type { PayChoice as Choice, PaidBy } from "@/lib/services/booking-pay";
import {
    PAID_BY,
    paidByNote,
    payChoices,
    payNote,
} from "@/lib/services/booking-pay";

/** A class pack the customer holds that covers this booking (ADR-007). */
export interface PackOffer {
    /** "Use Farah's class pack". */
    title: string;
    /** "10 Pilates classes · 4 left, 3 after this. Cancelling gives it back." */
    note: string;
    on: boolean;
    onChange: (on: boolean) => void;
}

/**
 * How they will pay (U3, BKMNewBookingStep5, BKDNewBooking step 5): "Pays
 * at the visit" first and picked (DEC-170), "Send a payment link" where it
 * is offered today (a priced booking, `payLink`), and "Paid now" with
 * Cash, UPI or Card and the board's one-line note for each (BA-20).
 *
 * A class pack the customer holds comes first, ticked; while it is ticked
 * the booking spends a class and nothing else is asked.
 *
 * Someone whose role can't take payment (a Member at the front desk,
 * DEC-098: `booking:write` and `invoice:write`, never a role's name) sees
 * "Paid now", and "Send a payment link" where it is shown, locked, saying
 * why; they book it to be paid at the visit.
 *
 * Controlled: the flow holds the choice and sends it with `payInput`
 * (`lib/services/booking-pay.ts`); `payProblem` names what is missing
 * when Book is pressed, and `invalid` then marks Cash · UPI · Card.
 */
export function PayChoice({
    value,
    onChange,
    paidBy,
    onPaidByChange,
    offerLink,
    canTakePayment = true,
    amount = null,
    pack = null,
    invalid = false,
    className,
}: {
    value: Choice;
    onChange: (choice: Choice) => void;
    paidBy: PaidBy | null;
    onPaidByChange: (how: PaidBy) => void;
    /** A payment link can be made for it (`people.payLink` and a price). */
    offerLink: boolean;
    /** `booking:write` and `invoice:write`: may record Paid now. */
    canTakePayment?: boolean;
    /** The price in words, "₹800"; null for none. */
    amount?: string | null;
    pack?: PackOffer | null;
    /** Paid now was asked for with no way picked. */
    invalid?: boolean;
    className?: string;
}) {
    const ids = { heading: useId(), how: useId(), note: useId() };
    const usingPack = pack?.on === true;
    const choices = payChoices(offerLink);

    return (
        <div className={cn("grid min-w-0 gap-3", className)}>
            {pack ? (
                <CheckRow
                    checked={pack.on}
                    onChange={pack.onChange}
                    className={cn(
                        "min-h-[64px] items-start gap-3 rounded-[12px] border px-3.5 py-3 transition-colors duration-fast",
                        pack.on
                            ? "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                            : "border-border",
                    )}
                    boxClassName="mt-0.5"
                >
                    <span className="grid min-w-0 gap-0.5">
                        <span className="text-[14.5px] font-semibold">
                            {pack.title}
                        </span>
                        <span className="text-[12.5px] text-muted-foreground">
                            {pack.note}
                        </span>
                    </span>
                </CheckRow>
            ) : null}
            {usingPack ? null : (
                <div className="grid min-w-0 gap-1.5">
                    <span id={ids.heading} className="label">
                        How will they pay?
                    </span>
                    <RadioCards
                        labelledBy={ids.heading}
                        value={value}
                        onChange={onChange}
                        rowClassName="min-h-14 rounded-[12px] px-3.5 py-2.5 text-[14.5px] font-semibold"
                        options={choices.map((c) => {
                            const locked = c.key !== "DESK" && !canTakePayment;
                            return {
                                value: c.key,
                                label: c.label,
                                note: locked
                                    ? CANT_TAKE_PAYMENTS
                                    : payNote(c.key, amount),
                                disabled: locked,
                            };
                        })}
                    />
                    {value === "PAID" && canTakePayment ? (
                        <div className="mt-1 grid min-w-0 gap-1">
                            <Segmented
                                id={ids.how}
                                label="How they paid"
                                aria-describedby={ids.note}
                                block
                                options={PAID_BY.map((p) => ({
                                    value: p.key,
                                    label: p.label,
                                }))}
                                // Nothing picked yet: none is drawn chosen.
                                value={paidBy ?? ("" as PaidBy)}
                                onValueChange={onPaidByChange}
                                className={cn(
                                    invalid &&
                                        !paidBy &&
                                        "ring-2 ring-destructive ring-offset-1",
                                )}
                            />
                            <p
                                id={ids.note}
                                role={invalid && !paidBy ? "alert" : undefined}
                                className={cn(
                                    "text-[12.5px] leading-[1.5]",
                                    invalid && !paidBy
                                        ? "font-medium text-destructive-subtle-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                {paidBy
                                    ? paidByNote(paidBy, amount)
                                    : "Say how they paid: Cash, UPI or Card."}
                            </p>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
