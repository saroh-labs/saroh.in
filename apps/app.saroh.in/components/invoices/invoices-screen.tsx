"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { InvoiceCrumbs } from "@/components/invoices/invoice-crumbs";
import { InvoiceQuickLook } from "@/components/invoices/invoice-quick-look";
import { InvoiceRow } from "@/components/invoices/invoice-row";
import { ScopeNotice, SourceChips } from "@/components/invoices/source-filter";
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

/** The business's GST standing, for the line under the title. */
export interface InvoiceBusinessTax {
    registered: boolean;
    gstin: string | null;
}

const money = (amount: string | number, currency: string) =>
    formatMoneyMajor(amount, currency) ?? String(amount);

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
}: {
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
    function remember(key: "view" | "source", value: string | null) {
        const q = new URLSearchParams(params.toString());
        if (value === null) q.delete(key);
        else q.set(key, value);
        const s = q.toString();
        router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }

    function pick(next: InvoiceTab) {
        setTab(next);
        remember("view", next === "all" ? null : next);
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
    const tabLabel = INVOICE_TABS.find((t) => t.id === tab)?.label ?? "";
    // Every issued paper a bill of supply (D15): the line says so, rather
    // than "GST tax invoices".
    const exempt = exemptNote(invoices);

    return (
        // One block: the page container spaces its children apart, and the
        // design sets the title, note and tabs close together.
        <div>
            <InvoiceCrumbs />
            <PageHeader
                title="Invoices"
                className="mb-1.5"
                actions={
                    <>
                        <span className="text-[12.5px] text-muted-foreground">
                            {sums(owed)} owed to you · {overdueCount} overdue
                        </span>
                        {canWrite ? (
                            <Button
                                asChild
                                className="h-[38px] px-4 text-[13px]"
                            >
                                <Link href="/billing/invoices/new">
                                    New invoice
                                </Link>
                            </Button>
                        ) : null}
                    </>
                }
            />
            <p className="mb-3 text-[12px] text-muted-foreground">
                Orders and subscription renewals make their invoice themselves.
                {exempt
                    ? ` ${exempt}`
                    : tax
                      ? tax.registered
                          ? ` GST tax invoices${tax.gstin ? `, GSTIN ${tax.gstin}` : ""}.`
                          : " Not GST-registered — no tax is charged."
                      : null}
            </p>

            <div
                role="tablist"
                aria-label="Invoices"
                className="flex flex-wrap gap-0.5 border-b border-border"
            >
                {INVOICE_TABS.map((t) => {
                    const on = t.id === tab;
                    const n = mine.filter((i) => inTab(i, t.id)).length;
                    const alarm = t.id === "overdue" && n > 0;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => pick(t.id)}
                            className={cn(
                                "inline-flex items-center px-3.5 py-2.5 text-[13px] transition-colors duration-fast coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                    : "font-medium text-muted-foreground hover:text-foreground active:bg-accent-active",
                            )}
                        >
                            {t.label}
                            <span
                                className={cn(
                                    "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
                                    alarm
                                        ? "bg-destructive-subtle text-destructive-subtle-foreground"
                                        : "bg-muted text-muted-foreground",
                                )}
                            >
                                {n}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col pb-[26px] pt-4">
                {scope ? (
                    <ScopeNotice
                        line={scopeLine(scope, mine.length)}
                        clearHref={invoicesHref()}
                    />
                ) : (
                    <SourceChips
                        chips={chips}
                        chosen={chip}
                        onPick={pickChip}
                    />
                )}
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
                    <div
                        role="alert"
                        className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[12px] border border-destructive-subtle-foreground bg-destructive-subtle px-4 py-3"
                    >
                        <span className="flex-[1_1_260px] text-[13px] font-semibold text-destructive-subtle-foreground">
                            {overdueCount} overdue · {sums(overdue)} — worked
                            out from the due date.
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => pick("overdue")}
                            className="h-8 rounded-[8px] border-destructive-subtle-foreground px-3 text-[12.5px]"
                        >
                            Show them
                        </Button>
                    </div>
                ) : null}

                {invoices.length === 0 && !scope ? (
                    <EmptyState
                        icon={<ReceiptText />}
                        title="No invoices yet"
                        description="Orders and subscription renewals make their invoice themselves. For trade and one-off work, write one by hand."
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
                    <div className="rounded-[12px] border border-dashed border-border-strong px-5 py-10 text-center text-[13px] text-muted-foreground">
                        {scope && mine.length === 0
                            ? scopeEmptyLine(scope)
                            : chipEmptyLine(tabLabel, scope ? "all" : chip)}
                    </div>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {shown.map((i) => (
                            <li key={i.id}>
                                <InvoiceRow
                                    invoice={i}
                                    selected={peek?.id === i.id}
                                    onOpen={() => setPeek(i)}
                                />
                            </li>
                        ))}
                    </ul>
                )}

                {truncated ? (
                    <p className="mt-3 max-w-[68ch] text-[12px] text-muted-foreground">
                        Showing the newest {LIST_LIMIT} invoices and every
                        unpaid one; older paid and cancelled invoices are not
                        listed.
                    </p>
                ) : null}
            </div>

            <InvoiceQuickLook
                invoice={peek}
                canWrite={canWrite}
                businessName={businessName}
                onOpenChange={(open) => {
                    if (!open) setPeek(null);
                }}
            />
        </div>
    );
}
