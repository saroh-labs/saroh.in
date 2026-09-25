"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { InvoicePill } from "@/components/invoices/invoice-pill";
import { InvoiceQuickLook } from "@/components/invoices/invoice-quick-look";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { Invoice } from "@/lib/invoices/service";
import type { InvoiceTab } from "@/lib/invoices/status";
import {
    billedTo,
    inTab,
    INVOICE_TABS,
    invoicePill,
    owedSummary,
    sourceLine,
    whenLine,
    withCorrectionsUnder,
} from "@/lib/invoices/status";
import { LIST_LIMIT } from "@/lib/lists/capped";

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
 * and a quick look on each row.
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
}: {
    businessName: string;
    invoices: Invoice[];
    /** The newest read hit its cap: older paid and void ones are not here. */
    truncated?: boolean;
    canWrite: boolean;
    /** Null when the business's tax settings could not be read. */
    tax: InvoiceBusinessTax | null;
    initialTab: InvoiceTab;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [tab, setTab] = useState<InvoiceTab>(initialTab);
    const [peek, setPeek] = useState<Invoice | null>(null);

    function pick(next: InvoiceTab) {
        setTab(next);
        // The tab is part of the address, so a reload or a shared link keeps it.
        const q = new URLSearchParams(params.toString());
        if (next === "all") q.delete("view");
        else q.set("view", next);
        const s = q.toString();
        router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    }

    const { owed, overdue, overdueCount } = owedSummary(invoices);
    const rows = withCorrectionsUnder(invoices);
    const shown = rows.filter((i) => {
        if (inTab(i, tab)) return true;
        // A correction follows its invoice into whichever tab shows it.
        const parent = i.related
            ? invoices.find((p) => p.id === i.related?.id)
            : undefined;
        return tab !== "all" && parent !== undefined && inTab(parent, tab);
    });
    const tabLabel = INVOICE_TABS.find((t) => t.id === tab)?.label ?? "";

    return (
        // One block: the page container spaces its children apart, and the
        // design sets the title, note and tabs close together.
        <div>
            <PageHeader
                breadcrumb={["Payments", "Invoices"]}
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
                {tax
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
                    const n = invoices.filter((i) => inTab(i, t.id)).length;
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
                                    : "font-medium text-muted-foreground hover:text-foreground",
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

                {invoices.length === 0 ? (
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
                        No {tabLabel.toLowerCase()} invoices.
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

function InvoiceRow({
    invoice: i,
    selected,
    onOpen,
}: {
    invoice: Invoice;
    selected: boolean;
    onOpen: () => void;
}) {
    const pill = invoicePill(i);
    const when = whenLine(i);
    const credit = i.kind === "CREDIT_NOTE";
    const nested = credit || i.kind === "SUPPLEMENTARY";
    return (
        <button
            type="button"
            aria-haspopup="dialog"
            onClick={onOpen}
            className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 rounded-[11px] border border-border px-3.5 py-3 text-left transition-colors duration-fast hover:border-border-strong md:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)_minmax(0,1.6fr)_96px]",
                selected
                    ? "bg-brand-subtle shadow-[inset_3px_0_0_hsl(var(--highlight))]"
                    : "bg-card",
                nested && "md:ml-6 md:w-[calc(100%-1.5rem)]",
            )}
        >
            <span className="min-w-0">
                <span className="block font-mono text-[12.5px] font-medium text-foreground">
                    {i.number ?? "Draft"}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {i.issuedAt ? (
                        <ViewerDate iso={i.issuedAt} variant="dayMonth" />
                    ) : (
                        "Not issued yet"
                    )}
                </span>
            </span>
            <span className="min-w-0 text-right md:text-left">
                <span className="block truncate text-[14px] font-semibold text-foreground">
                    {billedTo(i).name}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {sourceLine(i)}
                </span>
            </span>
            <span className="min-w-0">
                <InvoicePill label={pill.label} variant={pill.variant} />
                <span
                    className={cn(
                        "mt-[3px] block text-[12px]",
                        when.late
                            ? "text-destructive-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {when.before}
                    {when.date ? (
                        <ViewerDate iso={when.date} variant="dayMonth" />
                    ) : null}
                    {when.after}
                </span>
            </span>
            <span className="text-right font-display text-[14px] font-semibold tabular-nums text-foreground">
                {credit ? "−" : ""}
                {money(i.total, i.currency)}
            </span>
        </button>
    );
}
