"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId } from "react";

import { LimitNoticeBlock } from "@/components/billing/limit-notice";
import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { PlanLock } from "@/lib/billing/access";
import { depositLock } from "@/lib/billing/access";
import type { OnlineProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import { depositNote, depositPausedNote } from "@/lib/services/service-editor";
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
 * visit; the booking page charges what the server works out. When online
 * can't take what it asks, it says what happens instead, with a link to
 * what fixes it (DEC-088, DEC-089, #821): paid at the desk where the
 * business allows the desk, or — a business that takes payment online
 * only — can't be booked online at all.
 *
 * A deposit is taken online, so on a plan without online payments
 * (`paymentsLock`, 6 Oct 2026) the deposits are locked, with the way up:
 * the business can take a deposit off, never set a new one, and a service
 * that already has one keeps it, paused — paid at the desk where the
 * business allows the desk. The API refuses the same (`MODULE_LOCKED`).
 */
export function DepositField({
    deposit,
    price,
    currency,
    visits = 1,
    saved = "NONE",
    paymentsLock = null,
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
    /** The deposit the service has saved: kept on a plan without online payments. */
    saved?: DepositMode;
    /** The plan's lock on online payments; null when deposits are open. */
    paymentsLock?: PlanLock | null;
    /** How the business takes payment when people book (DEC-088). */
    way?: BookingPayment;
    /** What happens when people book it online, when it isn't as chosen. */
    problem?: OnlineProblem | null;
    onChange: (deposit: DepositMode) => void;
}) {
    const label = useId();
    const lock = depositLock(paymentsLock, saved !== "NONE");
    const paused = lock !== null && deposit !== "NONE";
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
                        // Locked: off, or the deposit it already has.
                        disabled={
                            lock !== null && value !== "NONE" && value !== saved
                        }
                        onClick={() => onChange(value)}
                    >
                        {text}
                    </Chip>
                ))}
            </div>
            <p className={HELP}>
                {paused
                    ? depositPausedNote
                    : depositNote(deposit, price, currency, visits, way)}
            </p>
            {lock ? (
                <LimitNoticeBlock
                    full={false}
                    title={lock.title}
                    body={lock.body}
                    cta={lock.cta}
                    href={lock.href}
                    className="mt-2.5"
                />
            ) : problem ? (
                <p
                    role="status"
                    className={cn(
                        "mt-2 rounded-[8px] px-3 py-2 text-[12.5px] leading-[1.45]",
                        problem.blocked
                            ? "bg-warning-subtle text-warning-subtle-foreground"
                            : "bg-muted text-foreground",
                    )}
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
