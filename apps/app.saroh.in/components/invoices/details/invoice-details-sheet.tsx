"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { Skeleton } from "@saroh/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import {
    InvoiceDetailsView,
    SheetFoot,
} from "@/components/invoices/details/invoice-details-view";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { QuickLook } from "@/components/shared/forms/quick-look";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatMoneyMajor } from "@/lib/format/money";
import { neighbours, nextLabel } from "@/lib/invoices/details-view";
import { invoiceHref } from "@/lib/invoices/links";
import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceTab } from "@/lib/invoices/status";
import { billedTo, headerPill } from "@/lib/invoices/status";
import { useInvoice, useInvoiceSave } from "@/lib/invoices/use-invoices";
import { invoiceZone } from "@/lib/invoices/zone";
import { FailedRead } from "@saroh/ui/failed-read";

/**
 * An invoice's details in a side sheet, opened from its row on the list
 * (DEC-173, U9 #1121, INVListAC): the same view as the invoice's page, 512px
 * from the right on a desk and the whole screen on a phone, with its
 * actions at the foot within a thumb's reach. Every action finishes here:
 * each opens over the sheet, and after a write the sheet, the list behind
 * it and the strip are read again in place (`useInvoiceSave`).
 *
 * Previous and Next walk the rows of the list as it is filtered ("Next
 * overdue" on Overdue) without closing. "Open full page" is the invoice's
 * own address, for a link to keep or share.
 */
export function InvoiceDetailsSheet({
    invoiceId,
    row,
    rows,
    tab,
    onMove,
    onClose,
}: {
    /** The invoice open; null when closed. */
    invoiceId: string | null;
    /** Its row, when it is on the list: drawn at once while the read runs. */
    row: Invoice | null;
    /** The rows as the list shows them, for Previous and Next. */
    rows: readonly Invoice[];
    tab: InvoiceTab;
    onMove: (invoice: Invoice) => void;
    onClose: () => void;
}) {
    const { saved } = useInvoiceSave();
    // The invoice's own read, shared with its page (`/api/invoices/[id]`).
    const read = useInvoice(invoiceId ? { invoiceId } : null);
    const details = read.data;

    /** After a write: this sheet, the list behind it and the strip read again. */
    const changed = () => void saved();

    const { previous, next } = neighbours(rows, invoiceId);
    const shown = details?.invoice ?? row;
    const title = shown?.number ?? (shown ? "Draft" : "Invoice");
    const pill = shown ? headerPill(shown) : null;
    const zone = details ? invoiceZone(details.business) : undefined;

    /** The foot: Share and More (once read), then Previous and Next. */
    const walk = (menus: ReactNode) => (
        <>
            {menus}
            <span className="flex-1" />
            <Button
                type="button"
                variant="outline"
                disabled={!previous}
                onClick={() => previous && onMove(previous)}
                aria-label="Previous invoice"
            >
                <ChevronLeft aria-hidden className="size-4" />
                <span className="max-sm:sr-only">Previous</span>
            </Button>
            <Button
                type="button"
                variant="outline"
                disabled={!next}
                onClick={() => next && onMove(next)}
            >
                {nextLabel(tab)}
                <ChevronRight aria-hidden className="size-4" />
            </Button>
        </>
    );

    return (
        <QuickLook
            open={invoiceId !== null}
            wide
            onOpenChange={(open) => !open && onClose()}
            title={title}
            titleClassName="font-mono"
            subtitle={
                shown ? (
                    <>
                        {billedTo(shown).name} ·{" "}
                        {formatMoneyMajor(shown.total, shown.currency)} ·{" "}
                        {shown.issuedAt ? (
                            <>
                                issued{" "}
                                <ViewerDate
                                    iso={shown.issuedAt}
                                    variant="dayMonth"
                                    timeZone={zone}
                                />
                            </>
                        ) : (
                            "not issued yet"
                        )}
                    </>
                ) : undefined
            }
            status={
                pill ? (
                    <StatusBadge tone={pill.variant}>{pill.label}</StatusBadge>
                ) : undefined
            }
            description={
                shown
                    ? `Invoice ${title} for ${billedTo(shown).name}.`
                    : "An invoice's details."
            }
        >
            {details ? (
                <InvoiceDetailsView
                    // A new invoice starts its own state: no link or dialog
                    // of the last one carries over.
                    key={details.invoice.id}
                    details={details}
                    layout="sheet"
                    onChanged={changed}
                    onGone={onClose}
                    foot={walk}
                />
            ) : read.isError && !read.isFetching ? (
                <>
                    <FailedRead
                        size="panel"
                        things="this invoice"
                        onRetry={() => void read.refetch()}
                    />
                    <SheetFoot>{walk(null)}</SheetFoot>
                </>
            ) : (
                <>
                    <div
                        className="grid gap-3"
                        role="status"
                        aria-busy="true"
                        data-invoice-sheet-loading
                    >
                        <span data-ph-unmask="" className="sr-only">
                            Loading the invoice
                        </span>
                        <Skeleton
                            aria-hidden
                            className="h-[120px] rounded-[12px]"
                        />
                        <Skeleton
                            aria-hidden
                            className="h-[96px] rounded-[12px]"
                        />
                        <Skeleton
                            aria-hidden
                            className="h-[320px] rounded-[6px]"
                        />
                    </div>
                    <SheetFoot>{walk(null)}</SheetFoot>
                </>
            )}
            {invoiceId ? (
                <IntentLink
                    data-ph-unmask=""
                    href={invoiceHref(invoiceId)}
                    className="-order-1 justify-self-end text-[12.5px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground coarse:py-2 print:hidden"
                >
                    Open full page
                </IntentLink>
            ) : null}
        </QuickLook>
    );
}
