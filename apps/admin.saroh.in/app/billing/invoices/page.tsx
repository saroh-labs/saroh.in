import { buttonVariants } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { InvoiceTable } from "@/components/billing/invoice-table";
import { NumberPager } from "@/components/billing/number-pager";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { listSarohInvoices } from "@/lib/billing";
import {
    billingHref,
    formatPaise,
    monthLabel,
    readGstin,
    readMonth,
    readPage,
    recentMonths,
} from "@/lib/billing-words";
import { requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Invoices · Billing" };

/**
 * Every invoice Saroh issued to a business for its plan (DEC-163), newest
 * first, with the filtered set's totals and the month's CSV for GST
 * filing. Read-only. Needs `saroh-billing:read` (Platform Owners and
 * Billing); the API checks it again and records every read.
 */
export default async function BillingInvoicesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const raw = await searchParams;
    const month = readMonth(raw.month);
    const q = param(raw.q);
    const gstin = readGstin(raw.gstin);
    const page = readPage(raw.page);
    const filters = { month, q, gstin };
    const result = await listSarohInvoices({ ...filters, page }).catch(
        () => undefined,
    );
    const filtered = [month, q, gstin].some((v) => v !== undefined);

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Billing", "Invoices"]}
                    title="Invoices"
                    description="Every invoice Saroh issued to a business for its plan, newest first. Dates are in India time."
                />
                <BillingTabs current="/billing/invoices" />

                <FilterBar action="/billing/invoices" active={filtered}>
                    <FilterSelect
                        label="Issued in"
                        name="month"
                        anyLabel="Any month"
                        defaultValue={month}
                        options={recentMonths(18).map((value) => ({
                            value,
                            label: monthLabel(value),
                        }))}
                    />
                    <FilterText
                        label="Business or invoice"
                        name="q"
                        defaultValue={q}
                        placeholder="Name, address or number"
                    />
                    <FilterSelect
                        label="Buyer GSTIN"
                        name="gstin"
                        anyLabel="With or without"
                        defaultValue={gstin}
                        options={[
                            { value: "yes", label: "With a GSTIN" },
                            { value: "no", label: "Without a GSTIN" },
                        ]}
                    />
                </FilterBar>

                {result === undefined ? (
                    <FailedState
                        title="Invoices could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : result === null ? (
                    <FailedState
                        title="Invoices are not open to you"
                        description="Your access does not cover Saroh's invoices."
                    />
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                label="Invoices"
                                value={result.totals.count.toLocaleString(
                                    "en-IN",
                                )}
                                hint={
                                    filtered
                                        ? "matching the filters"
                                        : "all time"
                                }
                            />
                            <StatCard
                                label="Before GST"
                                value={formatPaise(result.totals.taxablePaise)}
                            />
                            <StatCard
                                label="GST"
                                value={formatPaise(result.totals.taxPaise)}
                            />
                            <StatCard
                                label="Total charged"
                                value={formatPaise(result.totals.totalPaise)}
                            />
                        </div>

                        <ExportRow month={month} q={q} gstin={gstin} />

                        {result.items.length === 0 && page === 1 ? (
                            <EmptyState
                                title={
                                    filtered
                                        ? "No invoices match these filters"
                                        : "No invoices yet"
                                }
                                description="An invoice is written the moment Saroh takes a charge for a plan."
                            />
                        ) : (
                            <>
                                <InvoiceTable rows={result.items} />
                                <NumberPager
                                    page={result.page}
                                    pages={Math.max(
                                        1,
                                        Math.ceil(
                                            result.totals.count / result.limit,
                                        ),
                                    )}
                                    hasNext={
                                        result.page * result.limit <
                                        result.totals.count
                                    }
                                    href={(p) =>
                                        billingHref("/billing/invoices", {
                                            ...filters,
                                            page: p,
                                        })
                                    }
                                />
                            </>
                        )}
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

/** The month's CSV for GST filing, or what to do to get one. */
function ExportRow({
    month,
    q,
    gstin,
}: {
    month?: string;
    q?: string;
    gstin?: "yes" | "no";
}) {
    if (!month) {
        return (
            <p className="text-sm text-muted-foreground">
                Choose a month under Issued in to download its CSV for GST
                filing.
            </p>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-3">
            <a
                href={billingHref("/billing/invoices/export", {
                    month,
                    q,
                    gstin,
                })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
            >
                Download CSV for GST · {monthLabel(month)}
            </a>
            <span className="text-sm text-muted-foreground">
                One row per invoice, with the filters above.
            </span>
        </div>
    );
}
