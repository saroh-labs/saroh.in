"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useState } from "react";

import type { InvoiceRef } from "@/components/invoices/invoice-actions";
import { RecordPaymentDialog } from "@/components/invoices/invoice-actions";
import type { ContactOption } from "@/components/shared/contact-picker";
import type { OwedSummary } from "@/lib/contacts/holdings";
import { forWhat, invoiceMoney } from "@/lib/invoices/money";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, invoiceStatus } from "@/lib/invoices/status";

import { ContactPanelSection, ROW } from "./contact-panel";

/** How many rows before the rest are summed up in a line. */
const SHOWN = 8;

const unpaid = (i: Invoice) =>
    i.standing === "ISSUED" || i.standing === "OVERDUE";

/**
 * Unpaid first — overdue before due, the oldest due first, the one to chase
 * — then drafts and the rest, newest first. Every unpaid invoice is shown
 * however many there are; only paid, void and draft ones are cut.
 */
function orderInvoices(rows: readonly Invoice[]): {
    shown: Invoice[];
    hidden: number;
} {
    const open = rows
        .filter(unpaid)
        .sort(
            (a, b) =>
                Number(b.standing === "OVERDUE") -
                    Number(a.standing === "OVERDUE") ||
                (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
        );
    const rest = rows
        .filter((i) => !unpaid(i))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const room = Math.max(0, SHOWN - open.length);
    return {
        shown: [...open, ...rest.slice(0, room)],
        hidden: Math.max(0, rest.length - room),
    };
}

/** "₹3,000.00" or "₹3,000.00 + $40.00": never added across currencies. */
function owedWords(owed: OwedSummary): string {
    return owed.totals
        .map((t) => invoiceMoney(t.amount, t.currency))
        .join(" + ");
}

/**
 * A person's invoices, with what they owe in total from the API's owed
 * summary (nothing is added up here). Unpaid rows offer "Record payment" —
 * the invoice page's own dialog — to someone who may write invoices; "New
 * invoice" opens the form with this person already chosen.
 */
export function InvoicesPanel({
    contact,
    invoices,
    owed,
    canWrite,
}: {
    contact: ContactOption;
    /** Null when they, or what they owe, could not be read. */
    invoices: Invoice[] | null;
    owed: OwedSummary | null;
    canWrite: boolean;
}) {
    const [paying, setPaying] = useState<InvoiceRef | null>(null);
    const ordered = invoices ? orderInvoices(invoices) : null;

    return (
        <>
            <ContactPanelSection
                title="Invoices"
                count={invoices && owed ? invoices.length : null}
                failed="Their invoices"
                empty={`Nothing has been invoiced to ${contact.name}.${canWrite ? " A new invoice starts with them already chosen." : ""}`}
                action={
                    canWrite ? (
                        <Button size="sm" variant="outline" asChild>
                            <Link
                                href={`/billing/invoices/new?contactId=${encodeURIComponent(contact.id)}`}
                            >
                                New invoice
                            </Link>
                        </Button>
                    ) : null
                }
                aside={
                    owed && owed.unpaidCount > 0 ? (
                        <p className="border-b border-muted bg-muted/40 px-4 py-2.5 text-[12.5px]">
                            <span className="font-medium">
                                {owedWords(owed)} owed
                            </span>
                            <span className="text-muted-foreground">
                                {" "}
                                across {owed.unpaidCount}{" "}
                                {owed.unpaidCount === 1
                                    ? "invoice"
                                    : "invoices"}
                                {owed.overdueCount > 0
                                    ? `, ${owed.overdueCount} overdue`
                                    : ""}
                            </span>
                        </p>
                    ) : null
                }
            >
                {ordered ? (
                    <ul>
                        {ordered.shown.map((i) => {
                            const status = invoiceStatus(i);
                            const total = invoiceMoney(i.total, i.currency);
                            return (
                                <li key={i.id} className={ROW}>
                                    <span className="min-w-0 flex-1">
                                        <Link
                                            href={`/billing/invoices/${i.id}`}
                                            className={
                                                i.number
                                                    ? "-my-1 block truncate py-1 font-mono text-[13px] underline-offset-4 hover:underline"
                                                    : "-my-1 block truncate py-1 text-[13px] text-muted-foreground underline-offset-4 hover:underline"
                                            }
                                        >
                                            {i.number ?? "Draft, no number yet"}
                                        </Link>
                                        <span className="block truncate text-[11.5px] text-muted-foreground">
                                            {forWhat(i.summary)}
                                        </span>
                                    </span>
                                    <span className="text-[13px] tabular-nums">
                                        {total}
                                    </span>
                                    <Badge variant={status.variant}>
                                        {status.label}
                                    </Badge>
                                    {canWrite && unpaid(i) ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setPaying({
                                                    id: i.id,
                                                    number: i.number,
                                                    standing: i.standing,
                                                    who: billedTo(i).name,
                                                    total,
                                                })
                                            }
                                        >
                                            Record payment
                                        </Button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                ) : null}
                {ordered && ordered.hidden > 0 ? (
                    <p className="border-t border-foreground/10 px-4 py-2.5 text-[11.5px] text-muted-foreground">
                        {ordered.hidden} older{" "}
                        {ordered.hidden === 1 ? "invoice" : "invoices"}, paid,
                        void or draft, are in{" "}
                        <Link
                            href="/billing/invoices"
                            className="underline underline-offset-4"
                        >
                            Invoices
                        </Link>
                        .
                    </p>
                ) : null}
            </ContactPanelSection>
            {paying ? (
                <RecordPaymentDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setPaying(null);
                    }}
                    invoice={paying}
                />
            ) : null}
        </>
    );
}
