"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { INVOICE_GRID, InvoiceRow } from "@/components/invoices/invoice-row";
import {
    ListTable,
    listTable,
    ListTableHead,
} from "@/components/shared/list-toolbar";
import type { Invoice } from "@/lib/invoices/service";
import { LIST_LIMIT } from "@/lib/lists/capped";

/** What an empty list is, and the way back from it. */
export type ListEmpty =
    | { kind: "first-run" }
    | {
          kind: "no-results";
          /** Left out for a search: "No invoices match “q”". */
          title?: string;
          cause: "search" | "view";
          query?: string;
          onClear?: () => void;
      };

/**
 * The Invoices list's body (DEC-173, U8 #1120): the rows a page at a time,
 * at the size the list was last shown at, both empty states, and "Showing
 * the newest N" when the newest read hit its cap. A row opens the invoice
 * through `onOpen`, the screen's one seam for the details sheet (U9).
 */
export function InvoiceListBody({
    rows,
    empty,
    resetOn,
    selectedId,
    onOpen,
    timeZone,
    truncated,
    canWrite,
    busy,
    notice,
    rowBefore,
    rowAfter,
}: {
    rows: readonly Invoice[];
    /** Set when there is nothing to show, and why. */
    empty: ListEmpty | null;
    /** Back to page 1 when this changes: the filters in words. */
    resetOn: string;
    selectedId: string | null;
    onOpen: (invoice: Invoice) => void;
    timeZone?: string;
    truncated: boolean;
    canWrite: boolean;
    /** A new read of the list is on its way. */
    busy: boolean;
    /** Above the rows: "Only the 3 invoices paid in the last 24 hours". */
    notice?: ReactNode;
    /** A row's tick, while rows can be picked to remind (U12, desk only). */
    rowBefore?: (invoice: Invoice) => ReactNode;
    /** A row's own action beside it: Remind on Overdue (U12). */
    rowAfter?: (invoice: Invoice) => ReactNode;
}) {
    const { rows: paged, paging } = useLocalPages("invoices", rows, {
        label: "Pages of invoices",
        resetOn,
    });
    return (
        <div
            aria-busy={busy || undefined}
            className={cn(
                "flex flex-col pb-[26px] pt-4 transition-opacity duration-fast",
                busy && "opacity-70",
            )}
        >
            {notice ? <div className="mb-3.5">{notice}</div> : null}
            {empty?.kind === "first-run" ? (
                <EmptyState
                    icon={<ReceiptText />}
                    title="No invoices yet"
                    description="Orders and renewals are invoiced for you, and you can write one by hand."
                    action={
                        canWrite ? (
                            <Button asChild>
                                <Link href="/billing/invoices/new">
                                    New invoice
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : empty?.kind === "no-results" ? (
                <EmptyState
                    // It can name a pack or course, or what was searched.
                    data-ph-mask=""
                    kind="no-results"
                    things="invoices"
                    cause={empty.cause}
                    query={empty.query}
                    icon={<ReceiptText />}
                    title={empty.title}
                    onClear={empty.onClear}
                />
            ) : (
                <ListTable>
                    <ListTableHead
                        className={cn(
                            INVOICE_GRID,
                            "max-md:hidden",
                            // The ticks' column, ahead of the head's own.
                            rowBefore && "md:pl-[52px]",
                            rowAfter && "md:pr-[122px]",
                        )}
                    >
                        <span>Billed to</span>
                        <span>Invoice</span>
                        <span>Status</span>
                        <span className="text-right">Total</span>
                    </ListTableHead>
                    <ul aria-label="Invoices">
                        {paged.map((i) => (
                            <li key={i.id} className={listTable.rule}>
                                <InvoiceRow
                                    invoice={i}
                                    selected={selectedId === i.id}
                                    onOpen={() => onOpen(i)}
                                    timeZone={timeZone}
                                    before={rowBefore?.(i)}
                                    after={rowAfter?.(i)}
                                />
                            </li>
                        ))}
                    </ul>
                </ListTable>
            )}
            {empty ? null : paging}

            {truncated ? (
                <p className="mt-3 max-w-[68ch] text-[12px] text-muted-foreground">
                    Showing the newest {LIST_LIMIT} invoices and every unpaid
                    one. Older paid and cancelled invoices are not listed.
                    Search finds any invoice, however old.
                </p>
            ) : null}
        </div>
    );
}
