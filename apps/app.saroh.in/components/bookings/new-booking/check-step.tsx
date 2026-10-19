"use client";

import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import type { ComponentProps } from "react";

import { PayChoice } from "@/components/bookings/sheets/pay-choice";
import { Refusal } from "@/components/shared/refusal";

import type { CheckRow } from "./steps";
import { CheckCard } from "./steps";

/**
 * Step 5, Check and book (BKMNewBookingStep5, BKDNewBooking): the check
 * card with Change on each line, the customer's Needs attention, how they
 * will pay (a class pack first when they hold one, and which, when more
 * than one), and why Book was refused, where the choice is.
 */
export function CheckStep({
    rows,
    attention,
    pay,
    packs,
    packRefusal,
    refusal,
}: {
    rows: readonly CheckRow[];
    /** "Allergy: Latex · Medical: …"; null for nothing to say. */
    attention: string | null;
    pay: ComponentProps<typeof PayChoice>;
    /** The packs that can pay, to pick from when more than one. */
    packs: {
        value: string;
        options: { value: string; label: string }[];
        onChange: (id: string) => void;
    } | null;
    packRefusal: string | null;
    refusal: string | null;
}) {
    return (
        <div className="grid min-w-0 gap-3">
            <CheckCard rows={rows} />
            {attention ? (
                <Notice tone="error" role="note">
                    Needs attention: {attention}
                </Notice>
            ) : null}
            <PayChoice className="mt-1" {...pay} />
            {packs && packs.options.length > 1 ? (
                <OptionSelect
                    aria-label="Which pack"
                    value={packs.value}
                    onValueChange={packs.onChange}
                    options={packs.options}
                />
            ) : null}
            {packRefusal ? <Notice tone="error">{packRefusal}</Notice> : null}
            <Refusal>{refusal}</Refusal>
        </div>
    );
}
