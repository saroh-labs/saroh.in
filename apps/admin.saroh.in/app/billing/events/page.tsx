import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { businessBillingHref } from "@/components/billing/action-list";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { NumberPager } from "@/components/billing/number-pager";
import { RefList } from "@/components/billing/razorpay-id";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { listProviderEvents } from "@/lib/billing";
import {
    EVENT_FILTER_LABEL,
    EVENT_FILTERS,
    RAZORPAY_LINK_HINT,
    readEventFilter,
    refLabel,
} from "@/lib/billing-action-words";
import { billingHref, istDateTime, readPage } from "@/lib/billing-words";
import { requireStaff } from "@/lib/console";

export const metadata = { title: "Provider events · Billing" };

const BASE = "/billing/events";

/**
 * What Saroh's billing provider sent (DEC-166), across every business,
 * newest first: its type and id, the business it matched or none, whether
 * it was applied, and the provider's ids it names as dashboard links —
 * never the payload. "Not applied" is an event Saroh rejected or matched
 * to nothing; "No business" one it couldn't place. Read-only; needs
 * `saroh-billing:read`.
 */
export default async function BillingEventsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    const raw = await searchParams;
    const filter = readEventFilter(raw.filter);
    const page = readPage(raw.page);
    const result = await listProviderEvents({ filter, page }).catch(
        () => undefined,
    );

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Billing", "Provider events"]}
                    title="Provider events"
                    description="Everything Saroh's billing provider sent, newest first. Dates are in India time."
                />
                <BillingTabs current="/billing/events" />

                <FilterBar action={BASE} active={filter !== undefined}>
                    <FilterSelect
                        label="Show"
                        name="filter"
                        anyLabel="All events"
                        defaultValue={filter}
                        options={EVENT_FILTERS.map((value) => ({
                            value,
                            label: EVENT_FILTER_LABEL[value],
                        }))}
                    />
                </FilterBar>

                {result === undefined ? (
                    <FailedState
                        title="Provider events could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : result === null ? (
                    <FailedState
                        title="Provider events are not open to you"
                        description="Your access does not cover Saroh's billing."
                    />
                ) : result.items.length === 0 && page === 1 ? (
                    <EmptyState
                        title={
                            filter
                                ? "No events match this filter"
                                : "No events yet"
                        }
                        description="An event is kept the moment the billing provider sends one."
                    />
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            {RAZORPAY_LINK_HINT}
                        </p>
                        <ul className="grid gap-2">
                            {result.items.map((e) => (
                                <li
                                    key={e.id}
                                    className="grid gap-1 rounded-lg border p-3 text-sm"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                        <span className="font-mono text-[13px] font-medium">
                                            {e.type}
                                        </span>
                                        <span className="text-[12px] text-muted-foreground">
                                            {istDateTime(e.receivedAt)}
                                            {e.processedAt
                                                ? " · applied"
                                                : " · not applied"}
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground">
                                        {e.organization ? (
                                            <Link
                                                href={businessBillingHref(
                                                    e.organization.slug,
                                                )}
                                                className="underline underline-offset-4"
                                            >
                                                {e.organization.name}
                                            </Link>
                                        ) : (
                                            "No business"
                                        )}{" "}
                                        · {e.provider} ·{" "}
                                        <span className="break-all font-mono text-[12px]">
                                            {e.providerEventId}
                                        </span>
                                    </p>
                                    <RefList
                                        refs={{
                                            ...e.refs,
                                            provider: e.provider,
                                        }}
                                        labelOf={refLabel}
                                    />
                                </li>
                            ))}
                        </ul>
                        <NumberPager
                            page={result.page}
                            pages={Math.max(
                                1,
                                Math.ceil(result.total / result.limit),
                            )}
                            hasNext={result.page * result.limit < result.total}
                            href={(p) => billingHref(BASE, { filter, page: p })}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
