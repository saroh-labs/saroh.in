"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import {
    InvoiceDetailsView,
    SheetFoot,
} from "@/components/invoices/details/invoice-details-view";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { QuickLook } from "@/components/shared/forms/quick-look";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { FailedRead } from "@/components/shared/states/failed-read";
import { formatMoneyMajor } from "@/lib/format/money";
import type { InvoiceDetails } from "@/lib/invoices/details";
import { loadInvoiceDetails } from "@/lib/invoices/details-actions";
import { neighbours, nextLabel } from "@/lib/invoices/details-view";
import { invoiceHref } from "@/lib/invoices/links";
import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceTab } from "@/lib/invoices/status";
import { billedTo, headerPill } from "@/lib/invoices/status";
import { invoiceZone } from "@/lib/invoices/zone";

type Read =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; details: InvoiceDetails };

/**
 * An invoice's details in a side sheet, opened from its row on the list
 * (DEC-173, U9 #1121, INVListAC): the same view as the invoice's page, 512px
 * from the right on a desk and the whole screen on a phone, with its
 * actions at the foot within a thumb's reach. Every action finishes here:
 * each opens over the sheet, and after a write the sheet reads the invoice
 * again in place while the list behind it catches up.
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
    const router = useRouter();
    const [read, setRead] = useState<Read>({ state: "loading" });
    const [attempt, setAttempt] = useState(0);

    // Another invoice starts a new read.
    const [was, setWas] = useState(invoiceId);
    if (invoiceId !== was) {
        setWas(invoiceId);
        setRead({ state: "loading" });
    }

    useEffect(() => {
        if (!invoiceId) return;
        let live = true;
        void loadInvoiceDetails(invoiceId).then((res) => {
            if (!live) return;
            setRead(
                res.ok
                    ? { state: "ready", details: res.data }
                    : { state: "failed", error: res.error },
            );
        });
        return () => {
            live = false;
        };
    }, [invoiceId, attempt]);

    /** After a write: this sheet reads it again, the list behind it too. */
    function changed() {
        setAttempt((n) => n + 1);
        router.refresh();
    }

    const { previous, next } = neighbours(rows, invoiceId);
    const shown = read.state === "ready" ? read.details.invoice : row;
    const title = shown?.number ?? (shown ? "Draft" : "Invoice");
    const pill = shown ? headerPill(shown) : null;
    const zone =
        read.state === "ready" ? invoiceZone(read.details.business) : undefined;

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
            {read.state === "ready" ? (
                <InvoiceDetailsView
                    // A new invoice starts its own state: no link or dialog
                    // of the last one carries over.
                    key={read.details.invoice.id}
                    details={read.details}
                    layout="sheet"
                    onChanged={changed}
                    onGone={onClose}
                    foot={walk}
                />
            ) : read.state === "failed" ? (
                <>
                    <FailedRead
                        size="panel"
                        things="this invoice"
                        onRetry={() => {
                            setRead({ state: "loading" });
                            setAttempt((n) => n + 1);
                        }}
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
                        <span className="sr-only">Loading the invoice</span>
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
                <Link
                    href={invoiceHref(invoiceId)}
                    className="-order-1 justify-self-end text-[12.5px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground coarse:py-2 print:hidden"
                >
                    Open full page
                </Link>
            ) : null}
        </QuickLook>
    );
}
