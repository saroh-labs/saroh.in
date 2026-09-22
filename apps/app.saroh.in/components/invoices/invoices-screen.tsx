"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Plus, ReceiptText } from "lucide-react";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import { forWhat, invoiceMoney } from "@/lib/invoices/money";
import type { Invoice } from "@/lib/invoices/service";
import { billedTo, invoiceStatus } from "@/lib/invoices/status";

/**
 * The tabs, after the "Saroh Billing and Classes" design. They never
 * overlap: Issued is issued and not yet due, Overdue is issued and past due.
 * Their ids are a URL contract (`?view=`), shared with the API's list views.
 */
const FILTERS: DataFilter<Invoice>[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft", predicate: (i) => i.standing === "DRAFT" },
    {
        id: "issued",
        label: "Issued",
        predicate: (i) => i.standing === "ISSUED",
    },
    {
        id: "overdue",
        label: "Overdue",
        predicate: (i) => i.standing === "OVERDUE",
    },
    { id: "paid", label: "Paid", predicate: (i) => i.standing === "PAID" },
    { id: "void", label: "Void", predicate: (i) => i.standing === "VOID" },
];

/**
 * Billing → Invoices: every invoice the business has issued or drafted.
 *
 * Who it is billed to comes from the bill-to copied on issue, so an invoice
 * for someone since removed from Contacts still says who it was for — marked
 * "(removed)" rather than turned into a broken link.
 */
export function InvoicesScreen({
    invoices,
    businessName,
    canWrite,
    initialFilterId,
}: {
    invoices: Invoice[];
    businessName: string;
    canWrite: boolean;
    initialFilterId?: string;
}) {
    const columns: DataColumn<Invoice>[] = [
        {
            id: "number",
            header: "Invoice",
            priority: "secondary",
            width: "150px",
            sortValue: (i) => i.number ?? "",
            cell: (i) =>
                i.number ? (
                    <span className="font-mono text-[13px]">{i.number}</span>
                ) : (
                    <span className="font-mono text-[13px] text-muted-foreground">
                        No number yet
                    </span>
                ),
        },
        {
            id: "who",
            header: "Who and what for",
            priority: "primary",
            sortValue: (i) => billedTo(i).name.toLowerCase(),
            cell: (i) => {
                const who = billedTo(i);
                const removed = i.status !== "DRAFT" && !who.contactId;
                return (
                    <span className="min-w-0">
                        <span
                            className={
                                removed
                                    ? "block truncate text-[13.5px] font-medium text-muted-foreground"
                                    : "block truncate text-[13.5px] font-medium"
                            }
                        >
                            {who.name}
                            {removed ? " (removed)" : ""}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                            {forWhat(i.summary)}
                        </span>
                    </span>
                );
            },
        },
        {
            id: "issued",
            header: "Issued",
            priority: "detail",
            width: "120px",
            sortValue: (i) => i.issuedAt ?? "",
            cell: (i) =>
                i.issuedAt ? (
                    <ViewerDate iso={i.issuedAt} />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "due",
            header: "Due",
            priority: "detail",
            width: "120px",
            sortValue: (i) => i.dueAt ?? "",
            cell: (i) =>
                i.dueAt && i.status !== "DRAFT" ? (
                    <ViewerDate
                        iso={i.dueAt}
                        className={
                            i.standing === "OVERDUE"
                                ? "text-destructive-subtle-foreground"
                                : undefined
                        }
                    />
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "total",
            header: "Total",
            priority: "secondary",
            numeric: true,
            money: true,
            width: "140px",
            sortValue: (i) => Number(i.total),
            cell: (i) => invoiceMoney(i.total, i.currency),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "112px",
            sortValue: (i) => i.standing,
            cell: (i) => {
                const s = invoiceStatus(i);
                return <Badge variant={s.variant}>{s.label}</Badge>;
            },
        },
    ];

    return (
        <>
            <PageHeader
                breadcrumb={["Billing", "Invoices"]}
                title="Invoices"
                className="mb-0"
                actions={
                    canWrite ? (
                        <Button asChild>
                            <Link href="/invoices/new">
                                <Plus className="mr-1.5 size-4" />
                                New invoice
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
            <DataView
                viewId="invoices"
                rows={invoices}
                columns={columns}
                rowKey={(i) => i.id}
                rowHref={(i) => `/invoices/${i.id}`}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "invoice", other: "invoices" }}
                searchPlaceholder="Search invoices"
                searchableColumnIds={["number", "who"]}
                emptyState={{
                    icon: <ReceiptText />,
                    title: "No invoices yet",
                    note: "Memberships, class packs and courses invoice themselves as they are sold. For anything else, make one by hand.",
                    action: canWrite ? (
                        <Button asChild>
                            <Link href="/invoices/new">Make an invoice</Link>
                        </Button>
                    ) : undefined,
                }}
            />
            <p className="max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                Numbers are {businessName}&apos;s own run, from INV-0001. A
                voided invoice keeps its number.
            </p>
        </>
    );
}
