"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import type { ActionDoes } from "@/components/invoices/details/action-bar";
import { ActionButton } from "@/components/invoices/details/action-bar";
import type { InvoiceActions } from "@/lib/invoices/detail-actions";
import type { MoneyMessage, MoneyTone } from "@/lib/invoices/status";

const TITLE: Record<MoneyTone, string> = {
    neutral: "text-foreground",
    owed: "text-foreground",
    late: "text-destructive-subtle-foreground",
    paid: "text-success-subtle-foreground",
    waiting: "text-warning-subtle-foreground",
};

const EDGE: Record<MoneyTone, string> = {
    neutral: "border-border",
    owed: "border-border",
    late: "border-destructive/40",
    paid: "border-border",
    waiting: "border-warning/50",
};

/**
 * The money card (INVPageA, INVListAC): one message for the state — "₹8,400
 * to collect · 13 days late · due 7 Oct", "Paid ₹4,000 of ₹8,400 · cash on
 * 12 Oct", the cheque waiting — then the state's main button and what sits
 * beside it, then at most one note under them (`note`), so a screen never
 * stacks notices. `extra` is what the merchant works with there and then:
 * a payment link made in this tab, to copy again.
 */
export function MoneyCard({
    message,
    actions,
    does,
    note,
    foot,
    extra,
    describedBy,
    className,
}: {
    message: MoneyMessage;
    actions: InvoiceActions;
    does: ActionDoes;
    note?: ReactNode;
    /** The card's last line: why it can't be emailed, with the way to fix it. */
    foot?: ReactNode;
    extra?: ReactNode;
    /** The note a disabled button's reason is read from. */
    describedBy?: string;
    className?: string;
}) {
    const buttons = [
        ...(actions.main ? [{ a: actions.main, main: true }] : []),
        ...actions.beside.map((a) => ({ a, main: false })),
    ];
    return (
        <section
            aria-label="Money"
            data-money-card={message.tone}
            className={cn(
                "grid gap-2.5 rounded-[12px] border bg-card px-4 py-[15px] print:hidden",
                EDGE[message.tone],
                className,
            )}
        >
            <div>
                <p
                    className={cn(
                        "text-[22px] font-semibold tabular-nums leading-tight",
                        TITLE[message.tone],
                    )}
                >
                    {message.title}
                </p>
                {message.detail ? (
                    <p
                        className={cn(
                            "mt-1 text-[13px] leading-[1.45]",
                            message.tone === "late"
                                ? "text-destructive-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {message.detail}
                    </p>
                ) : null}
            </div>
            {buttons.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {buttons.map(({ a, main }) => (
                        <ActionButton
                            key={a.id}
                            action={a}
                            main={main}
                            does={does}
                            describedBy={describedBy}
                            className="max-sm:flex-1"
                        />
                    ))}
                </div>
            ) : null}
            {extra}
            {note ? (
                <div className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    {note}
                </div>
            ) : null}
            {foot ? (
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    {foot}
                </p>
            ) : null}
        </section>
    );
}
