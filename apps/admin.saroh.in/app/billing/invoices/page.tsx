import { buttonVariants } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { StatCard } from "@saroh/ui/stat-card";

import {
    InvoiceStatusChips,
    InvoiceTable,
} from "@/components/billing/invoice-table";
import { NumberPager } from "@/components/billing/number-pager";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { listSarohInvoices } from "@/lib/billing";
import { RAZORPAY_LINK_HINT } from "@/lib/billing-action-words";
import { clearHref, invoicesExportHref } from "@/lib/billing-filters";
import type { GstinFilter, InvoiceStatus } from "@/lib/billing-words";
import {
    billingHref,
    formatPaise,
    monthLabel,
    readGstin,
    readInvoiceStatus,
    readMonth,
    readPage,
} from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Invoices · Billing" };

/**
 * Every invoice Saroh issued to a business for its plan (DEC-163), newest
 * first, with the filtered set's totals and the month's CSV for the CA
 * (R29). Paid · Unpaid · Refunded are chips; the month and GSTIN are
 * picked in Billing's toolbar. Each applies at once, and the export keeps
 * them all. Read-only. Needs `saroh-billing:read` (Platform Owners and
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
    const status = readInvoiceStatus(raw.status);
    const page = readPage(raw.page);
    const filters = { month, q, gstin, status };
    const result = await listSarohInvoices({ ...filters, page }).catch(
        () => undefined,
    );
    const filtered = [month, q, gstin, status].some((v) => v !== undefined);

    if (result === undefined) return <FailedPanel things="invoices" />;
    if (result === null) {
        return (
            <PermissionDeniedState
                size="panel"
                title="Invoices are not open to you"
                description="Your access does not cover Saroh's invoices."
            />
        );
    }

    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Invoices"
                    value={result.totals.count.toLocaleString("en-IN")}
                    hint={filtered ? "matching the filters" : "all time"}
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

            <div className="flex flex-wrap items-center justify-between gap-3">
                <InvoiceStatusChips counts={result.statusCounts} />
                <ExportRow {...filters} />
            </div>

            {result.items.length === 0 && page === 1 ? (
                filtered ? (
                    <EmptyPanel
                        kind="no-results"
                        things="invoices"
                        cause="filters"
                        clearHref={clearHref("invoices")}
                    />
                ) : (
                    <EmptyPanel
                        title="No invoices yet"
                        description="An invoice is written the moment Saroh takes a charge for a plan."
                    />
                )
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {RAZORPAY_LINK_HINT}
                    </p>
                    <InvoiceTable
                        rows={result.items}
                        canViewAs={can(staff, "organization:view-as")}
                    />
                    <NumberPager
                        page={result.page}
                        pages={Math.max(
                            1,
                            Math.ceil(result.totals.count / result.limit),
                        )}
                        hasNext={
                            result.page * result.limit < result.totals.count
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
    );
}

/**
 * The month's CSV for the CA's GST filing (R29), with every filter the
 * list has, or what to do to get one: a filing is one month.
 */
function ExportRow(filters: {
    month?: string;
    q?: string;
    gstin?: GstinFilter;
    status?: InvoiceStatus;
}) {
    if (!filters.month) {
        return (
            <p className="text-sm text-muted-foreground">
                Pick a month under Issued in to export it for the CA.
            </p>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">
                One row per invoice, with the filters above.
            </span>
            <a
                href={invoicesExportHref(filters)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
            >
                Export for the CA · {monthLabel(filters.month)}
            </a>
        </div>
    );
}
