import { PermissionDeniedState } from "@saroh/ui/data-state";

import { ActionList, FailedJobList } from "@/components/billing/action-list";
import { NumberPager } from "@/components/billing/number-pager";
import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import { listBillingActions } from "@/lib/billing";
import {
    RAZORPAY_LINK_HINT,
    readActionState,
} from "@/lib/billing-action-words";
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
 * toolbar. Reading needs `saroh-billing:read`; Mark resolved and Check the
 * refund again need `saroh-billing:act`. The failed billing jobs follow,
 * since the Billing role has no Jobs screen.
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

    return (
        <>
            {result.items.length === 0 && page === 1 ? (
                q ? (
                    <EmptyPanel
                        kind="no-results"
                        things="billing problems"
                        cause="search"
                        query={q}
                        clearHref={billingHref(BASE, { state: stateParam })}
                    />
                ) : state === "open" ? (
                    <EmptyPanel
                        title="Nothing needs action"
                        description="A row appears when Saroh's billing meets something it can't settle by itself."
                    />
                ) : (
                    <EmptyPanel
                        title="Nothing resolved yet"
                        description="A row moves here once someone marks it resolved, with what they did."
                    />
                )
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {RAZORPAY_LINK_HINT}
                    </p>
                    <ActionList items={result.items} canAct={canAct} />
                    <NumberPager
                        page={result.page}
                        pages={Math.max(
                            1,
                            Math.ceil(result.total / result.limit),
                        )}
                        hasNext={result.page * result.limit < result.total}
                        href={(p) =>
                            billingHref(BASE, { state: stateParam, q, page: p })
                        }
                    />
                </>
            )}

            <section className="grid gap-2">
                <h2 className="font-medium">Failed billing jobs</h2>
                {result.failedJobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No billing job has failed.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            They are retried from Operations › Jobs, which
                            Billing doesn&apos;t open: ask Operations or a
                            Platform Owner.
                        </p>
                        <FailedJobList jobs={result.failedJobs} />
                    </>
                )}
            </section>
        </>
    );
}
