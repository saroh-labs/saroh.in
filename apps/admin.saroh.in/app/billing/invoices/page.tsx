import { buttonVariants } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { StatCard } from "@saroh/ui/stat-card";

import { InvoiceTable } from "@/components/billing/invoice-table";
import { NumberPager } from "@/components/billing/number-pager";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { listSarohInvoices } from "@/lib/billing";
import { RAZORPAY_LINK_HINT } from "@/lib/billing-action-words";
import { clearHref } from "@/lib/billing-filters";
import {
    billingHref,
    formatPaise,
    monthLabel,
    readGstin,
    readMonth,
    readPage,
} from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Invoices · Billing" };

/**
 * Every invoice Saroh issued to a business for its plan (DEC-163), newest
 * first, with the filtered set's totals and the month's CSV for GST
 * filing. The month and GSTIN are picked in Billing's toolbar and apply at
 * once. Read-only. Needs `saroh-billing:read` (Platform Owners and
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

            <ExportRow month={month} q={q} gstin={gstin} />

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
                Pick a month under Issued in to download its CSV for GST filing.
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
