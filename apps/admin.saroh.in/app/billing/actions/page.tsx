import { buttonVariants } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { ActionList, FailedJobList } from "@/components/billing/action-list";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { NumberPager } from "@/components/billing/number-pager";
import { listBillingActions } from "@/lib/billing";
import {
    ACTION_STATES,
    RAZORPAY_LINK_HINT,
    readActionState,
} from "@/lib/billing-action-words";
import { billingHref, readPage } from "@/lib/billing-words";
import { can, requireStaff } from "@/lib/console";

export const metadata = { title: "Needs action · Billing" };

const BASE = "/billing/actions";

const STATE_LABEL = { open: "Open", resolved: "Resolved" } as const;

/**
 * Everything about Saroh's billing an operator must act on by hand
 * (DEC-166), across every business, oldest open first: a refund owed, a
 * cancel the provider keeps refusing, a payment Saroh never matched, an
 * invoice whose total isn't what was taken, a credit note to ask the CA
 * about. Reading needs `saroh-billing:read`; Mark resolved and Check the
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
    const page = readPage(raw.page);
    const result = await listBillingActions({ state, page }).catch(
        () => undefined,
    );

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Billing", "Needs action"]}
                    title="Needs action"
                    description="What Saroh's billing couldn't settle by itself, across every business, oldest first. Dates are in India time."
                />
                <BillingTabs current="/billing/actions" />

                <nav
                    aria-label="Open or resolved"
                    className="flex flex-wrap items-center gap-2"
                >
                    {ACTION_STATES.map((value) => (
                        <Link
                            key={value}
                            href={billingHref(BASE, {
                                state: value === "open" ? undefined : value,
                            })}
                            aria-current={value === state ? "page" : undefined}
                            className={buttonVariants({
                                variant:
                                    value === state ? "secondary" : "ghost",
                                size: "sm",
                            })}
                        >
                            {STATE_LABEL[value]}
                            {value === "open" && result
                                ? ` · ${result.openCount.toLocaleString("en-IN")}`
                                : ""}
                        </Link>
                    ))}
                </nav>

                {result === undefined ? (
                    <FailedState
                        title="Needs action could not be loaded"
                        description="The API did not answer. Nothing has changed; try again in a moment."
                    />
                ) : result === null ? (
                    <FailedState
                        title="Needs action is not open to you"
                        description="Your access does not cover Saroh's billing."
                    />
                ) : (
                    <>
                        {result.items.length === 0 && page === 1 ? (
                            <EmptyState
                                title={
                                    state === "open"
                                        ? "Nothing needs action"
                                        : "Nothing resolved yet"
                                }
                                description="A row appears when Saroh's billing meets something it can't settle by itself."
                            />
                        ) : (
                            <>
                                <p className="text-sm text-muted-foreground">
                                    {RAZORPAY_LINK_HINT}
                                </p>
                                <ActionList
                                    items={result.items}
                                    canAct={canAct}
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
                                            state:
                                                state === "open"
                                                    ? undefined
                                                    : state,
                                            page: p,
                                        })
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
                                        They are retried from Operations › Jobs,
                                        which Billing doesn&apos;t open: ask
                                        Operations or a Platform Owner.
                                    </p>
                                    <FailedJobList jobs={result.failedJobs} />
                                </>
                            )}
                        </section>
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
