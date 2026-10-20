"use client";

import { Button } from "@saroh/ui/button";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ChequesLine } from "@/components/invoices/cheques-line";
import { InvoiceDetailsSheet } from "@/components/invoices/details/invoice-details-sheet";
import type { InvoiceBusinessTax } from "@/components/invoices/gst-status-line";
import { GstStatusLine } from "@/components/invoices/gst-status-line";
import type { ListEmpty } from "@/components/invoices/invoice-list-body";
import { InvoiceListBody } from "@/components/invoices/invoice-list-body";
import { InvoiceSearch } from "@/components/invoices/invoice-search";
import { MoneyStrip } from "@/components/invoices/money-strip";
import { ScopeNotice, SourceFilter } from "@/components/invoices/source-filter";
import { ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
import { SinceNotice } from "@/components/shared/since-notice";
import { formatDay } from "@/lib/format/datetime";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { invoicesHref } from "@/lib/invoices/links";
import type { ListQuery } from "@/lib/invoices/list-view";
import {
    figureEmptyLine,
    hrefOf,
    narrowed,
    readsOnServer,
    shownRows,
    withFigure,
    withSearch,
    withTab,
} from "@/lib/invoices/list-view";
import { exemptNote } from "@/lib/invoices/paper-title";
import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceScope, SourceChip } from "@/lib/invoices/sources";
import {
    chipEmptyLine,
    chipsFor,
    inChip,
    scopeEmptyLine,
    scopeLine,
} from "@/lib/invoices/sources";
import type { InvoiceTab } from "@/lib/invoices/status";
import { inTab, INVOICE_TABS, paidSinceRows } from "@/lib/invoices/status";
import type { InvoiceSummary, SummaryFilter } from "@/lib/invoices/summary";
import { withoutSince } from "@/lib/views/since";

export type { InvoiceBusinessTax } from "@/components/invoices/gst-status-line";

/**
 * Payments → Invoices (DEC-173, U8 #1120, INVListAC and INVListACPhone):
 * every invoice the business has — made by orders, by subscription
 * renewals, or written by hand.
 *
 * From the top: the title (on a phone a compact bar: no breadcrumb, the
 * count and New on one line), one GST line, the money strip (Owed,
 * Overdue, Paid this month, Drafts, each a filter), the cheques line while
 * a cheque waits, then the one toolbar (search, the status, what it was
 * for) and the rows. The old header's owed figure and the red overdue
 * banner are the strip now: the money is said once.
 *
 * Kept from before (§15): the status filter with its counts (`?tab=`),
 * "What it was for" (`?source=`) and one pack's or course's invoices
 * (`?pack=`, `?course=`), Home's "Last 24 hours" (`?since=`), corrections
 * under their invoice, paging, "Showing the newest N", and both empty
 * states. A row opens the invoice's details in a side sheet (U9 #1121),
 * where every action finishes; `?invoice=` keeps it open on a reload.
 *
 * Overdue is worked out from the due date by the API, never stored. A
 * credit note sits under the invoice it corrects and never counts as
 * owed; an order's own paper is owed on the order.
 */
export function InvoicesScreen({
    invoices,
    truncated = false,
    canWrite,
    tax,
    query,
    initialChip = "all",
    scope = null,
    paidSince = null,
    paidSinceInvoices = null,
    timeZone,
    missingRates = null,
    summary,
}: {
    /**
     * What is on sale with a price and no GST rate, for a GST-registered
     * business: a tax invoice for one shows no GST. Null when it couldn't
     * be told, which says nothing of it.
     */
    missingRates?: MissingRates | null;
    /**
     * The business's zone, which the invoice's dates are written in
     * (#836), as on the paper the customer gets. Absent, the viewer's.
     */
    timeZone?: string;
    invoices: Invoice[];
    /** The newest read hit its cap: older paid and void ones are not here. */
    truncated?: boolean;
    canWrite: boolean;
    /** Null when the business's tax settings could not be read. */
    tax: InvoiceBusinessTax | null;
    /** What the address narrows the list to (`listQueryFrom`). */
    query: ListQuery;
    /** The source `?source=` chose (D18). */
    initialChip?: SourceChip;
    /**
     * One pack's or course's invoices (D18): `invoices` holds only theirs,
     * read so by the API, and the source filter gives way to the pill.
     */
    scope?: InvoiceScope | null;
    /**
     * From Home's "Last 24 hours" (`?since=`, F6): only the invoices paid
     * from then on — the money Home added up, a credit note never.
     */
    paidSince?: Date | null;
    /**
     * The API's own read of those (`?paidSince=`, H-7), which finds an old
     * invoice paid today; null when it couldn't answer, and the list on
     * hand is filtered instead.
     */
    paidSinceInvoices?: Invoice[] | null;
    /** The money strip's read; null when it couldn't be read. */
    summary: InvoiceSummary | null;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [busy, start] = useTransition();
    // What the list is showing: the address's, and what was just picked
    // before the address catches up, so a figure or a status answers at
    // once.
    const [picked, setPicked] = useState<ListQuery | null>(null);
    const [chip, setChip] = useState<SourceChip>(initialChip);
    // The invoice whose details are open in the side sheet (`?invoice=`).
    const [openId, setOpenId] = useState<string | null>(() =>
        params.get("invoice"),
    );
    // A new address from the server is the truth again: what was picked
    // has arrived (or a link moved the list), so it gives way.
    const [arrived, setArrived] = useState({ query, initialChip });
    if (arrived.query !== query || arrived.initialChip !== initialChip) {
        setArrived({ query, initialChip });
        setPicked(null);
        setChip(initialChip);
    }
    const shownQuery = picked ?? query;

    const go = (next: URLSearchParams) =>
        start(() => router.replace(hrefOf(pathname, next), { scroll: false }));
    // Every move of the list closes the sheet: its `?invoice=` goes too.
    const here = () => {
        const q = new URLSearchParams(params.toString());
        q.delete("invoice");
        return q;
    };

    /** The status dropdown: a figure of its own goes. */
    function pickTab(tab: InvoiceTab) {
        setPicked({
            ...shownQuery,
            tab,
            owed: false,
            cheques: false,
            paidFrom: null,
        });
        go(withTab(here(), tab));
    }

    /** A figure of the strip, or the cheques line; null shows them all. */
    function pickFigure(filter: SummaryFilter | null) {
        setPicked({
            ...shownQuery,
            tab:
                filter?.view === "overdue"
                    ? "overdue"
                    : filter?.view === "draft"
                      ? "draft"
                      : "all",
            owed: filter?.view === "owed",
            cheques: filter?.view === "cheques",
            paidFrom: filter?.paidFrom ?? null,
        });
        showInvoice(null);
        go(withFigure(here(), filter));
    }

    function pickChip(next: SourceChip) {
        setChip(next);
        showInvoice(null);
        const q = here();
        if (next === "all") q.delete("source");
        else q.set("source", next);
        go(q);
    }

    function search(term: string) {
        if (term === shownQuery.q) return;
        showInvoice(null);
        go(withSearch(here(), term));
    }

    function clearAll() {
        setPicked({
            tab: "all",
            owed: false,
            cheques: false,
            paidFrom: null,
            q: "",
        });
        setChip("all");
        showInvoice(null);
        const q = withFigure(withSearch(here(), ""), null);
        q.delete("source");
        go(q);
    }

    /**
     * The one seam a row opens through: the details side sheet (U9). It is
     * kept in the address (`?invoice=`), so a reload or a shared link opens
     * it again, without asking the server for the list again.
     */
    function showInvoice(id: string | null) {
        setOpenId(id);
        const next = new URL(window.location.href);
        if (id) next.searchParams.set("invoice", id);
        else next.searchParams.delete("invoice");
        window.history.replaceState(window.history.state, "", next);
    }
    const openInvoice = (invoice: Invoice) => showInvoice(invoice.id);

    // Everything below — the counts, the rows — reads the chosen source's.
    const chips = scope ? [] : chipsFor(invoices, chip);
    const mine = scope ? invoices : inChip(invoices, chip);
    const rows = shownRows(
        paidSinceRows(
            mine,
            paidSinceInvoices && inChip(paidSinceInvoices, chip),
            paidSince,
        ),
        shownQuery,
    );
    const onServer = readsOnServer(query);
    const tabLabel =
        INVOICE_TABS.find((t) => t.id === shownQuery.tab)?.label ?? "";
    const day = (key: string) => formatDay(key);
    const somethingNarrows = narrowed(shownQuery) || (!scope && chip !== "all");

    const empty: ListEmpty | null =
        invoices.length === 0 && !scope && !onServer
            ? { kind: "first-run" }
            : rows.length > 0
              ? null
              : shownQuery.q
                ? {
                      kind: "no-results",
                      cause: "search",
                      query: shownQuery.q,
                      onClear: () => search(""),
                  }
                : {
                      kind: "no-results",
                      cause: "view",
                      title: (
                          figureEmptyLine(shownQuery, day) ??
                          (scope && mine.length === 0
                              ? scopeEmptyLine(scope)
                              : chipEmptyLine(tabLabel, scope ? "all" : chip))
                      ).replace(/\.$/, ""),
                      onClear: somethingNarrows ? clearAll : undefined,
                  };

    // Every issued paper a bill of supply (D15): the line says so, rather
    // than "GST tax invoices".
    const exempt = exemptNote(invoices);
    const chequesOn = shownQuery.cheques;

    return (
        // One block: the page container spaces its children apart, and the
        // design sets the title, the lines and the strip close together.
        <div>
            <PageHeader
                compactOnPhone
                breadcrumb={["Payments", "Invoices"]}
                title="Invoices"
                // How many are on hand, until a search or a figure asks
                // the API: then the rows are the answer, not the business.
                count={
                    onServer
                        ? undefined
                        : countLabel(mine.length, {
                              one: "invoice",
                              other: "invoices",
                          })
                }
                className="mb-1"
                actions={
                    canWrite ? (
                        <Button asChild>
                            <Link
                                href="/billing/invoices/new"
                                aria-label="New invoice"
                            >
                                <span className="sm:hidden">New</span>
                                <span className="max-sm:hidden">
                                    New invoice
                                </span>
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
            <GstStatusLine
                tax={tax}
                exempt={exempt}
                missing={missingRates}
                className="mb-3.5 text-[12.5px] leading-relaxed text-muted-foreground max-sm:mb-3"
            />

            <MoneyStrip
                summary={summary}
                query={shownQuery}
                onPick={pickFigure}
                className="mb-2.5"
            />
            <ChequesLine
                summary={summary}
                on={chequesOn}
                onPick={pickFigure}
                className="mb-2.5"
            />

            {/* The one list toolbar, in one row: the search, then an
                invoice's standing and what it was for. */}
            <ListToolbar
                className="mt-3.5"
                search={
                    <InvoiceSearch
                        term={shownQuery.q}
                        searching={busy && shownQuery.q !== query.q}
                        onSearch={search}
                    />
                }
                onClear={somethingNarrows ? clearAll : undefined}
                clearLabel={
                    shownQuery.q && !narrowed({ ...shownQuery, q: "" })
                        ? "Clear search"
                        : "Clear filters"
                }
                filters={
                    <>
                        <ListFilter<InvoiceTab>
                            label="Invoice status"
                            value={shownQuery.tab}
                            onValueChange={pickTab}
                            options={INVOICE_TABS.map((t) => ({
                                value: t.id,
                                label:
                                    t.id === "all" ? "All invoices" : t.label,
                                count: mine.filter((i) => inTab(i, t.id))
                                    .length,
                            }))}
                        />
                        {scope ? (
                            <ScopeNotice
                                line={scopeLine(scope, mine.length)}
                                clearHref={invoicesHref()}
                            />
                        ) : chips.length > 0 ? (
                            <SourceFilter
                                chips={chips}
                                chosen={chip}
                                onPick={pickChip}
                            />
                        ) : null}
                    </>
                }
            />

            <InvoiceListBody
                rows={rows}
                empty={empty}
                resetOn={`${shownQuery.tab}|${chip}|${shownQuery.owed}|${shownQuery.cheques}|${shownQuery.paidFrom}|${shownQuery.q}`}
                selectedId={openId}
                onOpen={openInvoice}
                timeZone={timeZone}
                truncated={truncated && !onServer}
                canWrite={canWrite}
                busy={busy}
                notice={
                    paidSince ? (
                        <SinceNotice
                            count={rows.length}
                            noun={{ one: "invoice", other: "invoices" }}
                            verb="paid"
                            clearHref={withoutSince(
                                pathname,
                                Object.fromEntries(params.entries()),
                            )}
                        />
                    ) : null
                }
            />

            <InvoiceDetailsSheet
                invoiceId={openId}
                row={rows.find((r) => r.id === openId) ?? null}
                rows={rows}
                tab={shownQuery.tab}
                onMove={openInvoice}
                onClose={() => showInvoice(null)}
            />
        </div>
    );
}
