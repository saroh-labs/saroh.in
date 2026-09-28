"use client";

import { useId } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { DepositMode } from "@/lib/services/service";
import { depositNote } from "@/lib/services/service-editor";

import { HELP } from "./fields";

const DEPOSITS: [DepositMode, string][] = [
    ["NONE", "Nothing — they pay at the visit"],
    ["PERCENT_25", "25% deposit"],
    ["PERCENT_50", "50% deposit"],
    ["FULL", "The full price"],
];

/**
 * "At booking, they pay" (E8, the Service Editor design): nothing, a 25%
 * or 50% deposit, or the full price. The note works the split out from the
 * price as typed, so the merchant sees what a customer pays now and at the
 * visit; the booking page charges what the server works out.
 */
export function DepositField({
    deposit,
    price,
    currency,
    onChange,
}: {
    deposit: DepositMode;
    /** The price as typed. */
    price: string;
    currency: string;
    onChange: (deposit: DepositMode) => void;
}) {
    const label = useId();
    return (
        <>
            <Eyebrow id={label} className="mt-3">
                At booking, they pay
            </Eyebrow>
            <div
                role="radiogroup"
                aria-labelledby={label}
                className="flex flex-wrap gap-1.5"
            >
                {DEPOSITS.map(([value, text]) => (
                    <Chip
                        key={value}
                        on={deposit === value}
                        className="h-[34px] text-[13px]"
                        onClick={() => onChange(value)}
                    >
                        {text}
                    </Chip>
                ))}
            </div>
            <p className={HELP}>{depositNote(deposit, price, currency)}</p>
        </>
    );
}
