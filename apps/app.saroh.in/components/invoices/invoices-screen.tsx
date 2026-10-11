"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { InvoiceQuickLook } from "@/components/invoices/invoice-quick-look";
import { INVOICE_GRID, InvoiceRow } from "@/components/invoices/invoice-row";
import { ScopeNotice, SourceFilter } from "@/components/invoices/source-filter";
import {
    ListFilter,
    ListTable,
    listTable,
    ListTableHead,
    ListToolbar,
} from "@/components/shared/list-toolbar";
import { SinceNotice } from "@/components/shared/since-notice";
import { formatMoneyMajor } from "@/lib/format/money";
import { invoicesHref } from "@/lib/invoices/links";
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
import {
    inTab,
    INVOICE_TABS,
    owedSummary,
    paidSinceRows,
    withCorrectionsUnder,
} from "@/lib/invoices/status";
import { LIST_LIMIT } from "@/lib/lists/capped";
import { withoutSince } from "@/lib/views/since";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";

/** The business's GST standing, for the line under the title. */
export interface InvoiceBusinessTax {
    registered: boolean;
    gstin: string | null;
}

const money = (amount: string | number, currency: string) =>
    formatMoneyMajor(amount, currency);

/** "₹35,400", or "₹35,400 + $120" when a business bills in two currencies. */
function sums(list: { currency: string; cents: number }[]): string {
    if (list.length === 0) return money(0, "INR");
    return list.map((s) => money(s.cents / 100, s.currency)).join(" + ");
}

/**
 * Payments → Invoices, after the "Saroh Invoices" design: every invoice the
 * business has — made by orders, by subscription renewals, or written by
 * hand — in tabs with counts, what is owed, a banner while any are overdue,
 * and a quick look on each row. Chips narrow it by what each was for
 * (`?source=`, D18); from Pack or Course Detail it holds one pack's or
 * course's only (`?pack=`, `?course=`), and says so.
 *
 * Overdue is worked out from the due date by the API, never stored. A credit
 * note sits under the invoice it corrects and never counts as owed; an
 * order's own paper is owed on the order, so it never counts here either.
 */
export function InvoicesScreen({
    invoices,
    truncated = false,
    canWrite,
    businessName,
    tax,
    initialTab,
    initialChip = "all",
    scope = null,
    paidSince = null,
    paidSinceInvoices = null,
    timeZone,
}: {
    /**
     * The business's zone, which the invoice's dates are written in
     * (#836), as on the paper the customer gets. Absent, the viewer's.
     */
    timeZone?: string;
    businessName: string;
    invoices: Invoice[];
    /** The newest read hit its cap: older paid and void ones are not here. */
    truncated?: boolean;
    canWrite: boolean;
    /** Null when the business's tax settings could not be read. */
    tax: InvoiceBusinessTax | null;
    initialTab: InvoiceTab;
    /** The source chip `?source=` chose (D18). */
    initialChip?: SourceChip;
    /**
     * One pack's or course's invoices (D18): `invoices` holds only theirs,
     * read so by the API, and the chips give way to the pill.
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
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [tab, setTab] = useState<InvoiceTab>(initialTab);
    const [chip, setChip] = useState<SourceChip>(initialChip);
    const [peek, setPeek] = useState<Invoice | null>(null);

    // The tab and the chip are part of the address, so a reload or a shared
    // link keeps them.
    function remember(key: "tab" | "source", value: string | null) {
        const q = new URLSearchParams(params.toString());
        if (value === null) q.delete(key);
        else q.set(key, value);
        const s = q.toString();
        router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }

    function pick(next: InvoiceTab) {
        setTab(next);
        remember("tab", next === "all" ? null : next);
    }

    function pickChip(next: SourceChip) {
        setChip(next);
        setPeek(null);
        remember("source", next === "all" ? null : next);
    }

    // Everything below — the tabs, their counts, what is owed — reads the
    // chip's rows.
    const chips = scope ? [] : chipsFor(invoices, chip);
    const mine = scope ? invoices : inChip(invoices, chip);
    const { owed, overdue, overdueCount } = owedSummary(mine);
    const rows = withCorrectionsUnder(
        paidSinceRows(
            mine,
            paidSinceInvoices && inChip(paidSinceInvoices, chip),
            paidSince,
        ),
    );
    const shown = rows.filter((i) => {
        if (inTab(i, tab)) return true;
        // A correction follows its invoice into whichever tab shows it.
        const parent = i.related
            ? mine.find((p) => p.id === i.related?.id)
            : undefined;
        return tab !== "all" && parent !== undefined && inTab(parent, tab);
    });
    // A page of them at a time, at the size this list was last shown at.
    const { rows: paged, paging } = useLocalPages("invoices", shown, {
        label: "Pages of invoices",
        resetOn: `${tab}|${chip}`,
    });
    const tabLabel = INVOICE_TABS.find((t) => t.id === tab)?.label ?? "";
    // Every issued paper a bill of supply (D15): the line says so, rather
    // than "GST tax invoices".
    const exempt = exemptNote(invoices);

    return (
        // One block: the page container spaces its children apart, and the
        // design sets the title, note and tabs close together.
        <div>
            <PageHeader
                breadcrumb={["Payments", "Invoices"]}
                title="Invoices"
                count={countLabel(mine.length, {
                    one: "invoice",
                    other: "invoices",
                })}
                className="mb-1.5"
                // A summary, not a count of the list: before the button.
                meta={
                    mine.length > 0 ? (
                        <span>
                            {sums(owed)} owed to you · {overdueCount} overdue
                        </span>
                    ) : undefined
                }
                actions={
                    canWrite ? (
                        <Button asChild>
                            <Link href="/billing/invoices/new">
                                New invoice
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
            <p className="mb-3 text-[12px] text-muted-foreground">
                Orders and subscription renewals make their invoice themselves.
                {exempt
                    ? ` ${exempt}`
                    : tax
                      ? tax.registered
                          ? ` GST tax invoices${tax.gstin ? `, GSTIN ${tax.gstin}` : ""}.`
                          : " Not GST-registered. No tax is charged."
                      : null}
            </p>

            {/* The one list toolbar, in one row: an invoice's standing and
                what it was for are its two dropdown filters. */}
            <ListToolbar
                onClear={
                    tab !== "all" || (!scope && chip !== "all")
                        ? () => {
                              setTab("all");
                              setChip("all");
                              setPeek(null);
                              const q = new URLSearchParams(params.toString());
                              q.delete("tab");
                              q.delete("source");
                              const s = q.toString();
                              router.replace(
                                  s ? `${pathname}?${s}` : pathname,
                                  {
                                      scroll: false,
                                  },
                              );
                          }
                        : undefined
                }
                filters={
                    <>
                        <ListFilter<InvoiceTab>
                            label="Invoice status"
                            value={tab}
                            onValueChange={pick}
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

            <div className="flex flex-col pb-[26px] pt-4">
                {paidSince ? (
                    <div className="mb-3.5">
                        <SinceNotice
                            count={shown.length}
                            noun={{ one: "invoice", other: "invoices" }}
                            verb="paid"
                            clearHref={withoutSince(
                                pathname,
                                Object.fromEntries(params.entries()),
                            )}
                        />
                    </div>
                ) : null}
                {overdueCount > 0 && tab !== "overdue" ? (
                    <Notice tone="error" className="mb-3.5">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                                {overdueCount} overdue · {sums(overdue)}, worked
                                out from the due date.
                            </span>
                            <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => pick("overdue")}
                                className="border-destructive-subtle-foreground"
                            >
                                Show them
                            </Button>
                        </div>
                    </Notice>
                ) : null}

                {invoices.length === 0 && !scope ? (
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
                ) : shown.length === 0 ? (
                    <EmptyState
                        kind="no-results"
                        things="invoices"
                        cause="view"
                        icon={<ReceiptText />}
                        title={(scope && mine.length === 0
                            ? scopeEmptyLine(scope)
                            : chipEmptyLine(tabLabel, scope ? "all" : chip)
                        ).replace(/\.$/, "")}
                        onClear={
                            tab !== "all"
                                ? () => pick("all")
                                : !scope && chip !== "all"
                                  ? () => pickChip("all")
                                  : undefined
                        }
                    />
                ) : (
                    <ListTable>
                        <ListTableHead
                            className={cn(INVOICE_GRID, "max-md:hidden")}
                        >
                            <span>Invoice</span>
                            <span>Billed to</span>
                            <span>Status</span>
                            <span className="text-right">Total</span>
                        </ListTableHead>
                        <ul aria-label="Invoices">
                            {paged.map((i) => (
                                <li key={i.id} className={listTable.rule}>
                                    <InvoiceRow
                                        invoice={i}
                                        selected={peek?.id === i.id}
                                        onOpen={() => setPeek(i)}
                                        timeZone={timeZone}
                                    />
                                </li>
                            ))}
                        </ul>
                    </ListTable>
                )}
                {shown.length > 0 ? paging : null}

                {truncated ? (
                    <p className="mt-3 max-w-[68ch] text-[12px] text-muted-foreground">
                        Showing the newest {LIST_LIMIT} invoices and every
                        unpaid one. Older paid and cancelled invoices are not
                        listed.
                    </p>
                ) : null}
            </div>

            <InvoiceQuickLook
                invoice={peek}
                canWrite={canWrite}
                businessName={businessName}
                timeZone={timeZone}
                onOpenChange={(open) => {
                    if (!open) setPeek(null);
                }}
            />
        </div>
    );
}
