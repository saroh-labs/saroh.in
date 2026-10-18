import { PermissionDeniedState } from "@saroh/ui/data-state";

import { NumberPager } from "@/components/billing/number-pager";
import { PlanChips, StatusCards } from "@/components/billing/status-cards";
import { SubscriptionChangesProvider } from "@/components/billing/subscription-changes";
import { SubscriptionSheet } from "@/components/billing/subscription-sheet";
import { SubscriptionTable } from "@/components/billing/subscription-table";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import {
    getSarohSubscription,
    getSubscriptionHistory,
    listSarohSubscriptions,
} from "@/lib/billing";
import type { StatusCardKey } from "@/lib/billing-filters";
import { clearHref, isNarrowed } from "@/lib/billing-filters";
import type {
    SarohSubscriptionDetail,
    SarohSubscriptionPage,
} from "@/lib/billing-words";
import {
    billingHref,
    readPage,
    readStatus,
    readView,
} from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";
import type { BillingHistoryPage } from "@/lib/subscription-sheet";
import { readHistoryShow, readSheetTab } from "@/lib/subscription-sheet";

export const metadata = { title: "Subscriptions · Billing" };

const BASE = "/billing/subscriptions";

/**
 * Every business's Saroh plan subscription (R26, DEC-163): the month's
 * total at list price, five status cards and the plan chips that filter
 * as they are pressed, and a row per business with who it is billed to,
 * its plan and note, its status, its next charge and how it is paid, its
 * autopay and its last invoice. A row opens the subscription sheet
 * (`?open=`), with its tab (`?sheet=`) and, on History, its chip
 * (`?history=`) and page (`?hpage=`): History is read only when open.
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
    const sheetTab = readSheetTab(raw.sheet);
    const historyShow = readHistoryShow(raw.history);
    const historyPage = readPage(raw.hpage);
    const filters = { q, status, plan, view };
    const here = { ...filters, page };

    const [result, sheet, history] = await Promise.all([
        listSarohSubscriptions({ ...filters, page }).catch(() => undefined),
        open ? readDetail(open) : Promise.resolve(undefined),
        open && sheetTab === "history"
            ? readHistory(open, historyShow, historyPage)
            : Promise.resolve(undefined),
    ]);

    return (
        <SubscriptionChangesProvider>
            {result === undefined ? (
                <FailedPanel things="subscriptions" />
            ) : result === null ? (
                <PermissionDeniedState
                    size="panel"
                    title="Subscriptions are not open to you"
                    description="Your access does not cover Saroh's subscriptions."
                />
            ) : (
                <Subscriptions
                    result={result}
                    page={page}
                    narrowed={isNarrowed("subscriptions", raw)}
                    openHref={(id) => billingHref(BASE, { ...here, open: id })}
                    pageHref={(p) => billingHref(BASE, { ...filters, page: p })}
                />
            )}

            {sheet ? (
                <SubscriptionSheet
                    detail={sheet.detail}
                    failed={sheet.failed}
                    base={BASE}
                    query={raw}
                    tab={sheetTab}
                    history={history}
                    historyShow={historyShow}
                    canAct={can(staff, "saroh-billing:act")}
                    canViewAs={can(staff, "organization:view-as")}
                />
            ) : null}
        </SubscriptionChangesProvider>
    );
}

function Subscriptions({
    result,
    page,
    narrowed,
    openHref,
    pageHref,
}: {
    result: SarohSubscriptionPage;
    page: number;
    narrowed: boolean;
    openHref: (id: string) => string;
    pageHref: (page: number) => string;
}) {
    const { summary } = result;
    const byStatus = (s: string) =>
        summary.byStatus.find((row) => row.status === s)?.count ?? 0;
    const counts: Record<StatusCardKey, number> = {
        paying: byStatus("ACTIVE"),
        failed: byStatus("PAST_DUE"),
        trial: byStatus("TRIALING"),
        ending: summary.endingSoon,
        ended: byStatus("CANCELLED"),
    };
    const planCounts = new Map(summary.byPlan.map((p) => [p.key, p.count]));

    return (
        <>
            <StatusCards
                mrrPaise={summary.mrrPaise}
                currency={summary.currency}
                counts={counts}
            />
            <PlanChips
                plans={result.plans.map((p) => ({
                    ...p,
                    count: planCounts.get(p.key) ?? 0,
                }))}
            />

            {result.items.length === 0 && page === 1 ? (
                narrowed ? (
                    <EmptyPanel
                        kind="no-results"
                        things="subscriptions"
                        cause="filters"
                        clearHref={clearHref("subscriptions")}
                    />
                ) : (
                    <EmptyPanel
                        title="No subscriptions yet"
                        description="A business has a subscription once it is on a plan."
                    />
                )
            ) : (
                <>
                    <SubscriptionTable
                        rows={result.items}
                        openHref={Object.fromEntries(
                            result.items.map((row) => [
                                row.id,
                                openHref(row.id),
                            ]),
                        )}
                    />
                    <NumberPager
                        page={result.page}
                        pages={Math.max(
                            1,
                            Math.ceil(result.total / result.limit),
                        )}
                        hasNext={result.page * result.limit < result.total}
                        href={pageHref}
                    />
                </>
            )}
        </>
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

/** The History tab's page; undefined when the read failed. */
async function readHistory(
    id: string,
    show: ReturnType<typeof readHistoryShow>,
    page: number,
): Promise<BillingHistoryPage | null | undefined> {
    try {
        return await getSubscriptionHistory(id, { show, page });
    } catch {
        return undefined;
    }
}
