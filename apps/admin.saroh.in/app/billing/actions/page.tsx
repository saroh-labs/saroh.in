import { PermissionDeniedState } from "@saroh/ui/data-state";

import { NeedsActionQueue } from "@/components/billing/needs-action-queue";
import { NumberPager } from "@/components/billing/number-pager";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { listBillingActions } from "@/lib/billing";
import { readActionState } from "@/lib/billing-action-words";
import { billingHref, readPage } from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";

export const metadata = { title: "Needs action · Billing" };

const BASE = "/billing/actions";

/**
 * Everything about Saroh's billing an operator must act on by hand
 * (DEC-166), across every business, oldest open first: a refund owed, a
 * cancel the provider keeps refusing, a payment Saroh never matched, an
 * invoice whose total isn't what was taken, a credit note to ask the CA
 * about. Open or resolved, and the search, are picked in Billing's
 * toolbar. Each row says what happened in one sentence and offers its one
 * fix (R28, `lib/billing-action-words.ts`). Reading needs
 * `saroh-billing:read`; Mark resolved and Check the refund again need
 * `saroh-billing:act`. The failed billing jobs follow: Retry (`jobs:retry`)
 * runs one again in place, and Open in Jobs (`jobs:read`) goes to it.
 */
export default async function BillingActionsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-billing:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const canAct = can(staff, "saroh-billing:act");
    const canRetry = can(staff, "jobs:retry");
    const canOpenJobs = can(staff, "jobs:read");

    const raw = await searchParams;
    const state = readActionState(raw.state);
    const q = param(raw.q);
    const page = readPage(raw.page);
    const result = await listBillingActions({ state, q, page }).catch(
        () => undefined,
    );
    const stateParam = state === "open" ? undefined : state;

    if (result === undefined) return <FailedPanel things="what needs action" />;
    if (result === null) {
        return (
            <PermissionDeniedState
                size="panel"
                title="Needs action is not open to you"
                description="Your access does not cover Saroh's billing."
            />
        );
    }

    const empty =
        page !== 1 ? (
            <EmptyPanel
                title="Nothing on this page"
                description="Go back to the first page."
            />
        ) : q ? (
            <EmptyPanel
                kind="no-results"
                things="billing problems"
                cause="search"
                query={q}
                clearHref={billingHref(BASE, { state: stateParam })}
            />
        ) : state === "resolved" ? (
            <EmptyPanel
                title="Nothing resolved yet"
                description="A row moves here once someone marks it resolved, with what they did."
            />
        ) : undefined;

    return (
        <NeedsActionQueue
            items={result.items}
            failedJobs={result.failedJobs}
            canAct={canAct}
            canRetry={canRetry}
            canOpenJobs={canOpenJobs}
            empty={empty}
        >
            <NumberPager
                page={result.page}
                pages={Math.max(1, Math.ceil(result.total / result.limit))}
                hasNext={result.page * result.limit < result.total}
                href={(p) =>
                    billingHref(BASE, { state: stateParam, q, page: p })
                }
            />
        </NeedsActionQueue>
    );
}
