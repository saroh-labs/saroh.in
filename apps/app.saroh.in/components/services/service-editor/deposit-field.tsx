"use client";

import Link from "next/link";
import { useId } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { OnlineProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import { depositNote } from "@/lib/services/service-editor";
import type { BookingPayment } from "@/lib/staff/types";

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
 * visit; the booking page charges what the server works out. When the
 * choice leaves the service unbookable online — payment at booking with no
 * way to take it online, or a business that takes payment online only and
 * can't (DEC-088, #821) — it says so here, with a link to what fixes it.
 */
export function DepositField({
    deposit,
    price,
    currency,
    visits = 1,
    way = "BOTH",
    problem = null,
    onChange,
}: {
    deposit: DepositMode;
    /** The price as typed. */
    price: string;
    currency: string;
    /** A treatment's rest is paid over its visits (E10). */
    visits?: number;
    /** How the business takes payment when people book (DEC-088). */
    way?: BookingPayment;
    /** Why people can't book it online as it stands, if they can't. */
    problem?: OnlineProblem | null;
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
            <p className={HELP}>
                {depositNote(deposit, price, currency, visits, way)}
            </p>
            {problem ? (
                <p
                    role="status"
                    className="mt-2 rounded-[8px] bg-warning-subtle px-3 py-2 text-[12.5px] leading-[1.45] text-warning-subtle-foreground"
                >
                    {problem.text}{" "}
                    <Link
                        href={problem.fix.href}
                        className="rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {problem.fix.label}
                    </Link>
                </p>
            ) : null}
        </>
    );
}
