"use client";

import { cn } from "@saroh/ui/lib/utils";

import { OptionSelect } from "@/components/shared/option-select";
import {
    payWayOf,
    REFUND_POLICY,
    refundsInTime,
    ruleChoices,
} from "@/lib/services/availability-rules";
import type { BookingRules, OnlineBlocker } from "@/lib/staff/types";

import { PayWayRow } from "./pay-way-row";

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/**
 * Booking rules for the whole business (Availability): how far ahead and
 * how late people can book, free cancellation, how they pay (DEC-088) and
 * the refund policy (E30). Shown whether or not anyone is on the diary
 * (UX-022). Edits go through `onChange` into the page's one draft.
 */
export function BookingRulesCard({
    rules,
    canEdit,
    onlineBlocker,
    onChange,
}: {
    rules: BookingRules;
    canEdit: boolean;
    onlineBlocker?: OnlineBlocker | null;
    onChange: (fn: (rules: BookingRules) => void) => void;
}) {
    return (
        <section aria-labelledby="booking-rules" className={card}>
            <h2 id="booking-rules" className={cn(cardTitle, "mb-2")}>
                Booking rules
            </h2>
            <p className="mb-2 text-[11.5px] text-muted-foreground">
                For the whole business.
            </p>
            {ruleChoices(rules).map((r) => (
                <div key={r.key} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 text-[13px]">{r.label}</span>
                    <OptionSelect
                        aria-label={r.label}
                        disabled={!canEdit}
                        value={
                            rules[r.key] === null ? "" : String(rules[r.key])
                        }
                        onValueChange={(v) =>
                            onChange((x) => {
                                x[r.key] = v === "" ? null : Number(v);
                            })
                        }
                        className="h-8 w-auto rounded-[8px] text-[12.5px]"
                        options={r.options}
                    />
                </div>
            ))}
            {/* How people pay when they book (DEC-088). */}
            <PayWayRow
                way={payWayOf(rules)}
                blocker={onlineBlocker}
                disabled={!canEdit}
                onChange={(way) =>
                    onChange((x) => {
                        x.bookingPayment = way;
                    })
                }
            />
            {/* The business's refund policy (E30, DEC-058). */}
            <div className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-[13px]">
                    {REFUND_POLICY.label}
                </span>
                <OptionSelect
                    aria-label={REFUND_POLICY.label}
                    aria-describedby="refund-policy-hint"
                    disabled={!canEdit}
                    value={refundsInTime(rules) ? "refund" : "keep"}
                    onValueChange={(v) =>
                        onChange((x) => {
                            x.refundInTimeCancels = v === "refund";
                        })
                    }
                    className="h-8 w-auto rounded-[8px] text-[12.5px]"
                    options={[...REFUND_POLICY.options]}
                />
            </div>
            <p
                id="refund-policy-hint"
                className="text-[11.5px] text-muted-foreground"
            >
                {REFUND_POLICY.hint}
            </p>
        </section>
    );
}
