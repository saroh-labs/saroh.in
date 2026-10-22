"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import Link from "next/link";
import { useEffect, useState } from "react";

import { QuickLook } from "@/components/shared/forms/quick-look";
import { FailedRead } from "@/components/shared/states/failed-read";
import { WHO_CAN_CHANGE } from "@/components/shared/states/who-can-change";
import { useHold } from "@/components/shared/undo/use-hold";
import { formatMoney } from "@/lib/format/money";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type { SheetRead } from "@/lib/insights/money-actions";
import { readOwedBills } from "@/lib/insights/money-actions";
import type { OwedRowView } from "@/lib/insights/money-words";
import type { OwedBillRow } from "@/lib/insights/owed-bills";
import type { OwedAge } from "@/lib/insights/reads";
import { remindWithLink } from "@/lib/invoices/link-actions";
import { sendOutcome } from "@/lib/invoices/send";

import {
    AnswerCard,
    AnswerLink,
    AnswerText,
} from "@/components/insights/overview/answer-card";

/**
 * "Who owes me?" on the Money tab (DEC-171, plan U12, #1093; `IBMoneyD`,
 * `IBOwedD` beside the page, `IBOwedP` as a sheet on a phone): what is
 * owed and how much of it is more than a month late, then the three ages
 * (not due yet, 1 to 30 days late, more than 30), each with its amount and
 * a bar of its share. An age opens its bills, most late first, each with
 * Send reminder for a role that may send one (held ten seconds with Undo,
 * as every message to a customer is), and "Open unpaid bills" for the
 * Invoices list that age lives in.
 */
export function OwedByAge({
    text,
    rows,
    href,
    zone,
    canRemind,
}: {
    text: string;
    rows: readonly OwedRowView[];
    /** The unpaid bills list. */
    href: string;
    /** The business's zone, for the due dates. */
    zone: string;
    /** `invoice:write`: Send reminder is offered on each bill. */
    canRemind: boolean;
}) {
    const [open, setOpen] = useState(false);
    // The age last opened stays while the sheet closes.
    const [age, setAge] = useState<OwedAge | null>(null);
    const opened = rows.find((r) => r.age === age) ?? null;
    return (
        <AnswerCard question="Who owes me?" data-testid="money-owed">
            <AnswerText answer={text} />
            <ul className="grid w-full gap-1" data-ph-mask="">
                {rows.map((row) => (
                    <li key={row.age}>
                        <button
                            type="button"
                            onClick={() => {
                                setAge(row.age);
                                setOpen(true);
                            }}
                            disabled={row.count === 0}
                            aria-label={`${row.label}: ${row.amount ?? ""} ${row.bills}`.replace(
                                /\s+/g,
                                " ",
                            )}
                            className="grid w-full cursor-pointer grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 rounded-md py-1 text-left text-[13px] hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent coarse:min-h-11"
                        >
                            <span className="text-neutral-700 dark:text-muted-foreground">
                                {row.label}
                                <span className="sr-only">, {row.bills}</span>
                            </span>
                            <span className="text-right font-semibold tabular-nums">
                                {row.amount ?? row.bills}
                            </span>
                            <span
                                aria-hidden
                                className="col-span-2 h-2 overflow-hidden rounded bg-muted"
                            >
                                <span
                                    className="block h-full bg-brand"
                                    style={{ width: `${row.percent}%` }}
                                />
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            <AnswerLink href={href}>See unpaid bills</AnswerLink>
            <OwedSheet
                row={opened}
                open={open}
                zone={zone}
                canRemind={canRemind}
                onOpenChange={setOpen}
            />
        </AnswerCard>
    );
}

/** "₹12,530 more than 30 days late", "₹6,400 not due yet". */
function bigLine(row: OwedRowView): string {
    const what = row.label.charAt(0).toLowerCase() + row.label.slice(1);
    return row.amount ? `${row.amount} ${what}` : `${row.bills} ${what}`;
}

function OwedSheet({
    row,
    open,
    zone,
    canRemind,
    onOpenChange,
}: {
    row: OwedRowView | null;
    open: boolean;
    zone: string;
    canRemind: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const narrow = useNarrow();
    if (!row) return null;
    return (
        <QuickLook
            open={open}
            onOpenChange={onOpenChange}
            side={narrow ? "bottom" : "right"}
            title={row.label}
            subtitle="Who owes me"
            description={`${bigLine(row)}, ${row.bills}.`}
            footer={
                <Button asChild variant="outline" className="coarse:min-h-11">
                    <Link href={row.href}>Open unpaid bills</Link>
                </Button>
            }
        >
            <div className="grid gap-2.5" data-ph-mask="">
                <p className="font-display text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
                    {bigLine(row)}
                </p>
                <p className="text-xs text-muted-foreground">{row.bills}.</p>
                {/* Mounted afresh for each age, and each time it opens. */}
                <OwedBills
                    key={row.age}
                    age={row.age}
                    zone={zone}
                    canRemind={canRemind && row.age !== "notDue"}
                />
            </div>
        </QuickLook>
    );
}

/** The age's bills, read as the sheet opens. */
function OwedBills({
    age,
    zone,
    canRemind,
}: {
    age: OwedAge;
    zone: string;
    canRemind: boolean;
}) {
    const [bills, setBills] = useState<SheetRead<OwedBillRow[]> | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let live = true;
        void readOwedBills(age, zone).then((res) => {
            if (live) setBills(res);
        });
        return () => {
            live = false;
        };
    }, [age, zone, attempt]);

    if (bills === null) {
        return (
            <ul aria-hidden className="grid gap-3 py-2">
                {[0, 1].map((i) => (
                    <li key={i} className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-56" />
                    </li>
                ))}
            </ul>
        );
    }
    if (!bills.ok) {
        return bills.denied ? (
            <p className="text-[13.5px] text-muted-foreground">
                Your role can&apos;t open invoices. {WHO_CAN_CHANGE}
            </p>
        ) : (
            <FailedRead
                things="these bills"
                onRetry={() => {
                    setBills(null);
                    setAttempt((n) => n + 1);
                }}
            />
        );
    }
    if (bills.data.length === 0) {
        return <p className="text-[13.5px]">No bills here now.</p>;
    }
    return (
        <ul className="mb-1 mt-1.5" data-testid="owed-bills">
            {bills.data.map((bill) => (
                <OwedBill key={bill.id} bill={bill} canRemind={canRemind} />
            ))}
        </ul>
    );
}

/** One bill: who, which, how late, what's left, and Send reminder. */
function OwedBill({
    bill,
    canRemind,
}: {
    bill: OwedBillRow;
    canRemind: boolean;
}) {
    const { send, undo, pending } = useHold();
    const [sent, setSent] = useState(false);
    const key = `insights-remind:${bill.id}`;
    const holding = pending.includes(key);
    const first = bill.who.split(" ")[0] || bill.who;

    function remind() {
        let said = `Reminder sent to ${first}.`;
        setSent(true);
        send(key, {
            description: `${first} is reminded of ${formatMoney(bill.leftMinor, bill.currency)}.`,
            run: async () => {
                const res = await remindWithLink(bill.id);
                if (!res.ok) return { ok: false, error: res.error };
                // D17 says what really went: a customer who turned email
                // off is told on their account, not emailed, and that's said.
                said = sendOutcome(res.data, first, true).message;
                return { ok: true };
            },
            sent: () => said,
            onBack: () => setSent(false),
        });
    }

    return (
        <li className="flex flex-wrap items-center gap-2.5 border-t border-border py-2.5">
            <Link
                href={`/billing/invoices/${bill.id}`}
                className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <b className="truncate font-semibold">{bill.who}</b>
                <small className="text-xs text-muted-foreground">
                    {bill.line}
                </small>
            </Link>
            <span className="shrink-0 font-semibold tabular-nums">
                {formatMoney(bill.leftMinor, bill.currency)}
            </span>
            {canRemind ? (
                holding ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => undo(key)}
                        className="coarse:min-h-11"
                    >
                        Undo
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={sent}
                        onClick={remind}
                        className="coarse:min-h-11"
                    >
                        {sent ? "Reminder sent" : "Send reminder"}
                    </Button>
                )
            ) : null}
        </li>
    );
}
