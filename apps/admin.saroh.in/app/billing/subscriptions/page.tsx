import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";

import { AdminShell } from "@/components/admin-shell";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { NumberPager } from "@/components/billing/number-pager";
import { SubscriptionSheet } from "@/components/billing/subscription-sheet";
import { SubscriptionTable } from "@/components/billing/subscription-table";
import { FilterBar, FilterSelect, FilterText } from "@/components/filter-bar";
import { getSarohSubscription, listSarohSubscriptions } from "@/lib/billing";
import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import {
    billingHref,
    formatPaise,
    readPage,
    readStatus,
    readView,
    STATUS_LABEL,
    statusLabel,
    SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_VIEWS,
    VIEW_LABEL,
} from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Subscriptions · Billing" };

const BASE = "/billing/subscriptions";

/**
 * Every business's Saroh plan subscription (DEC-163): plan, state, when it
 * is paid until, what is coming (a move or an end), the provider's ids and
 * the last invoice, with counts and the list-price monthly figure. A row
 * opens a side sheet with its checkouts and what the billing provider sent.
 * Read-only. Needs `saroh-billing:read`; the API checks it again and
 * records every read.
 */
export default async function BillingSubscriptionsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const raw = await searchParams;
    const q = param(raw.q);
    const status = readStatus(raw.status);
    const plan = param(raw.plan);
    const view = readView(raw.view);
    const page = readPage(raw.page);
    const open = param(raw.open);
    const filters = { q, status, plan, view };
    const filtered = [q, status, plan, view].some((v) => v !== undefined);
    const here = { ...filters, page };

    const [result, sheet] = await Promise.all([
        listSarohSubscriptions({ ...filters, page }).catch(() => undefined),
        open ? readDetail(open) : Promise.resolve(undefined),
    ]);

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Billing", "Subscriptions"]}
                    title="Subscriptions"
                    description="Every business's Saroh plan. A row opens its checkouts and what the billing provider sent. Dates are in India time."
                />
                <BillingTabs current="/billing/subscriptions" />

                <FilterBar action={BASE} active={filtered}>
                    <FilterText
                        label="Business or Razorpay id"
                        name="q"
                        defaultValue={q}
                        placeholder="Name, sub_, cust_, order_ or pay_"
                    />
                    <FilterSelect
                        label="Show"
                        name="view"
                        anyLabel="Everyone"
                        defaultValue={view}
                        options={SUBSCRIPTION_VIEWS.map((value) => ({
                            value,
                            label: VIEW_LABEL[value],
                        }))}
                    />
                    <FilterSelect
                        label="Status"
                        name="status"
                        anyLabel="Any status"
                        defaultValue={status}
                        options={SUBSCRIPTION_STATUSES.map((value) => ({
                            value,
                            label: STATUS_LABEL[value],
                        }))}
                    />
                    <FilterSelect
                        label="Plan"
                        name="plan"
                        anyLabel="Any plan"
                        defaultValue={plan}
                        options={(result?.plans ?? []).map((p) => ({
                            value: p.key,
                            label: p.name,
                        }))}
                    />
                </FilterBar>

                {result === undefined ? (
                    <FailedState
                        title="Subscriptions could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : result === null ? (
                    <FailedState
                        title="Subscriptions are not open to you"
                        description="Your access does not cover Saroh's subscriptions."
                    />
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                label="Monthly, at list price"
                                value={formatPaise(
                                    result.summary.mrrPaise,
                                    result.summary.currency,
                                )}
                                hint="Before GST; active and payment-failed plans. Coupons, custom prices and add-ons not counted."
                            />
                            {result.summary.byStatus.map((s) => (
                                <StatCard
                                    key={s.status}
                                    label={statusLabel(s.status)}
                                    value={s.count.toLocaleString("en-IN")}
                                />
                            ))}
                        </div>
                        {result.summary.byPlan.length > 0 ? (
                            <p className="text-sm text-muted-foreground">
                                On each plan, not counting ended ones:{" "}
                                {result.summary.byPlan
                                    .map((p) => `${p.name} ${p.count}`)
                                    .join(" · ")}
                            </p>
                        ) : null}

                        {result.items.length === 0 && page === 1 ? (
                            <EmptyState
                                title={
                                    filtered
                                        ? "No subscriptions match these filters"
                                        : "No subscriptions yet"
                                }
                                description="A business has a subscription once it is on a plan."
                            />
                        ) : (
                            <>
                                <SubscriptionTable
                                    rows={result.items}
                                    openHref={Object.fromEntries(
                                        result.items.map((row) => [
                                            row.id,
                                            billingHref(BASE, {
                                                ...here,
                                                open: row.id,
                                            }),
                                        ]),
                                    )}
                                />
                                <NumberPager
                                    page={result.page}
                                    pages={Math.max(
                                        1,
                                        Math.ceil(result.total / result.limit),
                                    )}
                                    hasNext={
                                        result.page * result.limit <
                                        result.total
                                    }
                                    href={(p) =>
                                        billingHref(BASE, {
                                            ...filters,
                                            page: p,
                                        })
                                    }
                                />
                            </>
                        )}
                    </>
                )}

                {sheet ? (
                    <SubscriptionSheet
                        detail={sheet.detail}
                        failed={sheet.failed}
                        closeHref={billingHref(BASE, here)}
                        canAct={can(staff, "saroh-billing:act")}
                        canViewAs={can(staff, "organization:view-as")}
                    />
                ) : null}
            </PageContainer>
        </AdminShell>
    );
}

async function readDetail(id: string): Promise<{
    detail: SarohSubscriptionDetail | null;
    failed?: "error" | "refused";
}> {
    try {
        const detail = await getSarohSubscription(id);
        return detail ? { detail } : { detail: null, failed: "refused" };
    } catch {
        return { detail: null, failed: "error" };
    }
}
