"use client";

import { Badge } from "@saroh/ui/badge";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import Link from "next/link";

import type { SarohInvoiceRow } from "@/lib/billing-words";
import {
    cycleLabel,
    formatPaise,
    gstSplit,
    invoicePdfHref,
    istDate,
    refundedPaise,
    sourceLabel,
} from "@/lib/billing-words";
import { plural } from "@/lib/format";

import { businessBillingHref } from "./action-list";
import { RazorpayId } from "./razorpay-id";

/*
 * No column sorts: the order is the API's, newest first across every
 * business, and a page sorted in the browser would read as the whole list.
 */
const columns = (canViewAs: boolean): DataColumn<SarohInvoiceRow>[] => [
    {
        id: "number",
        header: "Invoice",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-medium">
                    {row.number}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                    {istDate(row.issuedAt)}
                </p>
            </div>
        ),
    },
    {
        id: "business",
        header: "Business",
        priority: "primary",
        cell: (row) => (
            <div className="min-w-0">
                {/* Without view-as, its subscription in Billing. */}
                <Link
                    href={
                        canViewAs
                            ? `/businesses/${row.organization.id}`
                            : businessBillingHref(row.organization.slug)
                    }
                    className="block truncate font-medium underline-offset-4 hover:underline"
                >
                    {row.organization.name}
                </Link>
                <p className="truncate text-[12px] text-muted-foreground">
                    Billed to {row.billToName}
                </p>
            </div>
        ),
    },
    {
        id: "plan",
        header: "Plan",
        priority: "secondary",
        cell: (row) => (
            <div className="min-w-0">
                <p className="truncate">
                    {row.planName} · {cycleLabel(row.cycle)}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                    {sourceLabel(row.source)}
                </p>
            </div>
        ),
    },
    {
        id: "taxable",
        header: "Before GST",
        priority: "detail",
        width: "120px",
        numeric: true,
        cell: (row) => formatPaise(row.taxablePaise, row.currency),
    },
    {
        id: "gst",
        header: "GST",
        priority: "detail",
        width: "200px",
        cell: (row) => (
            <span className="text-[13px] tabular-nums">{gstSplit(row)}</span>
        ),
    },
    {
        id: "total",
        header: "Total",
        priority: "primary",
        width: "120px",
        numeric: true,
        cell: (row) => formatPaise(row.totalPaise, row.currency),
    },
    {
        id: "gstin",
        header: "Buyer GSTIN",
        priority: "detail",
        width: "170px",
        cell: (row) =>
            row.billToGstin ? (
                <span className="font-mono text-[12px]">{row.billToGstin}</span>
            ) : (
                <span className="text-muted-foreground">None</span>
            ),
    },
    {
        id: "payment",
        header: "Payment",
        priority: "detail",
        width: "220px",
        cell: (row) => <PaymentCell row={row} />,
    },
    {
        id: "pdf",
        header: "",
        priority: "secondary",
        width: "70px",
        cell: (row) => (
            <a
                href={invoicePdfHref(row.id)}
                className="text-sm font-medium underline underline-offset-4"
                aria-label={`Download invoice ${row.number} as a PDF`}
            >
                PDF
            </a>
        ),
    },
];

/**
 * How it was paid (DEC-166): the payment as a Razorpay link, what Razorpay
 * took when it differs from the total, and what has been refunded.
 */
function PaymentCell({ row }: { row: SarohInvoiceRow }) {
    const refunded = refundedPaise(row);
    return (
        <div className="grid min-w-0 gap-0.5">
            {row.providerPaymentId ? (
                <RazorpayId
                    id={row.providerPaymentId}
                    provider={row.provider}
                    className="truncate"
                />
            ) : (
                <span className="text-muted-foreground">No payment id</span>
            )}
            {row.amountMismatch && row.providerAmountPaise !== null ? (
                <div>
                    <Badge variant="warning">
                        Razorpay took{" "}
                        {formatPaise(row.providerAmountPaise, row.currency)}
                    </Badge>
                </div>
            ) : null}
            {refunded > 0 ? (
                <span className="text-[12px] text-muted-foreground">
                    Refunded {formatPaise(refunded, row.currency)}
                </span>
            ) : null}
        </div>
    );
}

/** One page of Saroh's invoices, newest first. */
export function InvoiceTable({
    rows,
    canViewAs = false,
}: {
    rows: SarohInvoiceRow[];
    /** Holds `organization:view-as`: a business opens its own page. */
    canViewAs?: boolean;
}) {
    return (
        <DataView
            viewId="console-billing-invoices"
            rows={rows}
            columns={columns(canViewAs)}
            rowKey={(row) => row.id}
            modes={["table", "list"]}
            noun={{ one: "invoice", other: "invoices" }}
            countLabel={(visible) =>
                `${plural(visible, "invoice")} on this page`
            }
            emptyState={{
                title: "No invoices on this page",
                note: "Go back to the first page.",
            }}
        />
    );
}
