import { PermissionDeniedState } from "@saroh/ui/data-state";

import { NumberPager } from "@/components/billing/number-pager";
import { PlanChips, StatusCards } from "@/components/billing/status-cards";
import { SubscriptionChangesProvider } from "@/components/billing/subscription-changes";
import { SubscriptionSheet } from "@/components/billing/subscription-sheet";
import { SubscriptionTable } from "@/components/billing/subscription-table";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import {
    getSubscriptionHistory,
    listSarohSubscriptions,
    readSarohSubscription,
} from "@/lib/billing";
import type { StatusCardKey } from "@/lib/billing-filters";
import { clearHref, isNarrowed, narrowCause } from "@/lib/billing-filters";
import type { SarohSubscriptionPage } from "@/lib/billing-words";
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
 * Every business's Saroh plan subscription (R26, DEC-179): the month's
 * total at list price, the status chips and the plan chips that filter
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
    const list = (f: typeof filters) =>
        listSarohSubscriptions({ ...f, page }).catch(() => undefined);

    const [listed, sheet, history] = await Promise.all([
        list(filters),
        open ? readSarohSubscription(open) : Promise.resolve(undefined),
        open && sheetTab === "history"
            ? readHistory(open, historyShow, historyPage)
            : Promise.resolve(undefined),
    ]);
    // A plan key no plan has (an old or mistyped link) is ignored, not
    // read as "nothing matches".
    const unknownPlan =
        plan !== undefined &&
        Boolean(listed) &&
        !listed?.plans.some((p) => p.key === plan);
    const result = unknownPlan
        ? await list({ ...filters, plan: undefined })
        : listed;
    const query = unknownPlan ? { ...raw, plan: undefined } : raw;
    const shown = unknownPlan ? { ...filters, plan: undefined } : filters;

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
                    narrowed={isNarrowed("subscriptions", query)}
                    cause={narrowCause("subscriptions", query)}
                    q={q}
                    openHref={(id) =>
                        billingHref(BASE, { ...shown, page, open: id })
                    }
                    pageHref={(p) => billingHref(BASE, { ...shown, page: p })}
                />
            )}

            {sheet ? (
                <SubscriptionSheet
                    detail={sheet.detail}
                    failed={sheet.failed}
                    base={BASE}
                    query={query}
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
    cause,
    q,
    openHref,
    pageHref,
}: {
    result: SarohSubscriptionPage;
    page: number;
    narrowed: boolean;
    cause: "search" | "filters";
    q: string | undefined;
    openHref: (id: string) => string;
    pageHref: (page: number) => string;
}) {
    const { summary } = result;
    const byStatus = (s: string) =>
        summary.byStatus.find((row) => row.status === s)?.count ?? 0;
    const counts: Record<StatusCardKey, number> = {
        active: byStatus("ACTIVE"),
        paying: summary.paying,
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
            {narrowed ? (
                <p className="text-[13px] text-muted-foreground">
                    The counts are for all subscriptions, not only the ones
                    shown.
                </p>
            ) : null}

            {result.items.length === 0 && page === 1 ? (
                narrowed ? (
                    <EmptyPanel
                        kind="no-results"
                        things="subscriptions"
                        cause={cause}
                        query={q}
                        description={
                            q
                                ? "Search looks at business names, invoice numbers and Razorpay ids. Plans are the chips above."
                                : undefined
                        }
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
