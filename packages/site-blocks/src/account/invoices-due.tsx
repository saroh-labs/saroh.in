"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { PayInvoice } from "./details-api";
import { DETAILS_OFFLINE } from "./details-api";
import type { AccountInvoiceDue } from "./details-model";
import { invoiceLine, invoiceTag, invoiceTitle } from "./details-model";
import type { Block } from "./model";
import {
    AccountCard,
    AccountRow,
    smallPrimaryButton,
    Tag,
    Unavailable,
} from "./parts";

/**
 * The customer's invoices still to pay (DEC-142), on Home while there is
 * one and on Your details beside their receipts. "Pay now" asks the site's
 * server for a pay link made that moment — a customer never meets an old
 * one — and goes to the business's own pay page. An invoice the business
 * can't take online says to pay it directly; one autopay is charging says
 * so, and offers no second way to pay it (D13).
 */
export function InvoicesDue({
    invoices,
    businessName,
    payNow,
    id,
    whenNone = null,
    className,
}: {
    invoices: Block<AccountInvoiceDue[]>;
    businessName: string;
    payNow: PayInvoice;
    id?: string;
    /** What the card says with nothing to pay; null draws no card at all. */
    whenNone?: string | null;
    className?: string;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    async function pay(ref: string) {
        if (busy) return;
        setBusy(ref);
        setProblem(null);
        const result = await payNow(ref).catch(() => ({
            ok: false as const,
            message: DETAILS_OFFLINE,
        }));
        if (result.ok) {
            // The pay page is the business's own; the link was made just now.
            window.location.assign(result.url);
            return;
        }
        setBusy(null);
        setProblem(result.message);
    }

    if (!invoices.ok) {
        return (
            <AccountCard
                id={id}
                labelledBy="account-to-pay"
                title="To pay"
                className={className}
            >
                <Unavailable what="Your invoices" />
            </AccountCard>
        );
    }
    const rows = invoices.value;
    if (rows.length === 0 && whenNone === null) return null;
    return (
        <AccountCard
            id={id}
            labelledBy="account-to-pay"
            title="To pay"
            sub={rows.length > 0 ? String(rows.length) : undefined}
            lead={rows.length === 0 ? whenNone : undefined}
            needsYou={rows.length > 0}
            className={className}
        >
            {rows.map((invoice) => (
                <AccountRow
                    key={invoice.ref}
                    title={invoiceTitle(invoice)}
                    sub={invoiceLine(invoice, businessName) || undefined}
                    tag={
                        <Tag tone={invoice.overdue ? "accent" : "quiet"}>
                            {invoiceTag(invoice)}
                        </Tag>
                    }
                    actions={
                        invoice.pay === "online" ? (
                            <button
                                type="button"
                                className={smallPrimaryButton}
                                disabled={busy !== null}
                                onClick={() => void pay(invoice.ref)}
                                aria-label={`Pay ${invoice.number ? `invoice ${invoice.number}` : "this invoice"} now`}
                            >
                                {busy === invoice.ref ? "Opening…" : "Pay now"}
                            </button>
                        ) : undefined
                    }
                />
            ))}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
        </AccountCard>
    );
}
