"use client";

import { Badge } from "@saroh/ui/badge";
import { Chip } from "@saroh/ui/chip";
import type { DataColumn } from "@saroh/ui/data-view";
import { DataView } from "@saroh/ui/data-view";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Query } from "@/lib/billing-filters";
import { invoiceStatusHref } from "@/lib/billing-filters";
import type { InvoiceStatus, SarohInvoiceRow } from "@/lib/billing-words";
import {
    cycleLabel,
    formatPaise,
    gstSplit,
    INVOICE_STATUS_LABEL,
    INVOICE_STATUSES,
    invoicePdfHref,
    invoiceStatus,
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
        width: "140px",
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
            // Capped, so one long "Billed to … · GSTIN …" can't push PDF
            // and Open off the screen; the full line is the cell's title.
            <div className="min-w-0 max-w-[15rem]">
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
                {/* Who is billed, only when it isn't the business's own
                    name, and the buyer's GSTIN (no column of its own: ten
                    columns didn't fit a desk). */}
                <p
                    className="truncate text-[12px] text-muted-foreground"
                    title={[
                        row.billToName !== row.organization.name
                            ? `Billed to ${row.billToName}`
                            : null,
                        row.billToGstin ? `GSTIN ${row.billToGstin}` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                >
                    {[
                        row.billToName !== row.organization.name
                            ? `Billed to ${row.billToName}`
                            : null,
                        row.billToGstin
                            ? `GSTIN ${row.billToGstin}`
                            : "No GSTIN",
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>
            </div>
        ),
    },
    {
        id: "plan",
        header: "Plan",
        priority: "secondary",
        width: "140px",
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
        id: "status",
        header: "Status",
        priority: "primary",
        width: "104px",
        cell: (row) => <InvoiceStatusPill row={row} />,
    },
    {
        id: "gst",
        header: "GST",
        priority: "detail",
        width: "170px",
        // The GST on one line; how it splits, and what it was charged on,
        // under it (the long "CGST … + SGST …" wrapped onto four lines).
        cell: (row) => (
            <span className="grid gap-0.5">
                <span className="whitespace-nowrap tabular-nums">
                    {formatPaise(
                        row.cgstPaise + row.sgstPaise + row.igstPaise,
                        row.currency,
                    )}
                </span>
                <span
                    className="whitespace-nowrap text-[12px] text-muted-foreground"
                    title={gstSplit(row)}
                >
                    {row.taxType === "INTER" ? "IGST" : "CGST + SGST"} on{" "}
                    {formatPaise(row.taxablePaise, row.currency)}
                </span>
            </span>
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
        id: "payment",
        header: "Payment",
        priority: "detail",
        width: "170px",
        cell: (row) => <PaymentCell row={row} />,
    },
    {
        id: "pdf",
        header: "",
        priority: "secondary",
        width: "110px",
        cell: (row) => (
            <span className="flex items-center gap-3 text-sm font-medium">
                <a
                    href={invoicePdfHref(row.id)}
                    className="underline underline-offset-4"
                    aria-label={`Download invoice ${row.number} as a PDF`}
                >
                    PDF
                </a>
                {/* Its subscription, where its history and refunds are. */}
                <Link
                    href={businessBillingHref(row.organization.slug)}
                    className="underline underline-offset-4"
                    aria-label={`Open ${row.organization.name}'s subscription`}
                >
                    Open
                </Link>
            </span>
        ),
    },
];

const STATUS_TONE: Record<InvoiceStatus, "success" | "error" | "neutral"> = {
    paid: "success",
    unpaid: "error",
    refunded: "neutral",
};

/** Paid, Unpaid or Refunded (R29), by the API's own rule. */
function InvoiceStatusPill({ row }: { row: SarohInvoiceRow }) {
    const status = invoiceStatus(row);
    const part =
        status === "refunded" && refundedPaise(row) < row.totalPaise
            ? "Part refunded"
            : null;
    return (
        <Badge variant={STATUS_TONE[status]} size="sm">
            {part ?? INVOICE_STATUS_LABEL[status]}
        </Badge>
    );
}

const figures = new Intl.NumberFormat("en-IN");

/**
 * Paid · Unpaid · Refunded (R29): toggles (`aria-pressed`), one on at a
 * time; pressed again, every invoice. Each says how many it holds under
 * the month, GSTIN and search already picked.
 */
export function InvoiceStatusChips({
    counts,
}: {
    counts?: Record<InvoiceStatus, number>;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const query: Query = Object.fromEntries(params.entries());
    return (
        <div
            role="group"
            aria-label="Status"
            className="flex flex-wrap items-center gap-2"
        >
            {INVOICE_STATUSES.map((status) => (
                <Chip
                    key={status}
                    as="toggle"
                    on={query.status === status}
                    onClick={() =>
                        router.push(
                            invoiceStatusHref(pathname, query, status),
                            {
                                scroll: false,
                            },
                        )
                    }
                >
                    {INVOICE_STATUS_LABEL[status]}
                    {counts ? (
                        <span className="tabular-nums opacity-70">
                            {figures.format(counts[status])}
                        </span>
                    ) : null}
                </Chip>
            ))}
        </div>
    );
}

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
                    <Badge variant="warning" className="whitespace-normal">
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
