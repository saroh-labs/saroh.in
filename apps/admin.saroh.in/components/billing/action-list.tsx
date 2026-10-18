import Link from "next/link";

import type {
    BillingActionRow,
    FailedBillingJob,
} from "@/lib/billing-action-words";
import {
    actionLabel,
    canRecheckRefund,
    refLabel,
} from "@/lib/billing-action-words";
import { istDateTime } from "@/lib/billing-words";

import { RecheckRefund, ResolveAction } from "./billing-controls";
import { RefList } from "./razorpay-id";

/** Where a business's billing opens: its subscription, found by its slug. */
export function businessBillingHref(slug: string): string {
    return `/billing/subscriptions?q=${encodeURIComponent(slug)}`;
}

type ActionItem = Pick<
    BillingActionRow,
    "id" | "code" | "note" | "refs" | "createdAt"
> &
    Partial<
        Pick<
            BillingActionRow,
            "organization" | "resolvedAt" | "resolution" | "resolvedBy"
        >
    >;

/**
 * Billing actions as rows (DEC-166): what it is about, the business, the
 * note in Saroh's words, the provider's ids as dashboard links, when it was
 * raised, and for an operator who may act, Mark resolved (and Check the
 * refund again on a double charge). Resolved ones say how.
 */
export function ActionList({
    items,
    canAct,
    showBusiness = true,
}: {
    items: ActionItem[];
    canAct: boolean;
    showBusiness?: boolean;
}) {
    return (
        <ul className="grid gap-2">
            {items.map((action) => {
                const label = actionLabel(action.code);
                const open = !action.resolvedAt;
                return (
                    <li
                        key={action.id}
                        className="grid gap-1.5 rounded-lg border p-3 text-sm"
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="font-medium">{label}</p>
                            <p className="text-[12px] text-muted-foreground">
                                Raised {istDateTime(action.createdAt)}
                            </p>
                        </div>
                        {showBusiness ? (
                            <p className="text-muted-foreground">
                                {action.organization ? (
                                    <Link
                                        href={businessBillingHref(
                                            action.organization.slug,
                                        )}
                                        className="underline underline-offset-4"
                                    >
                                        {action.organization.name}
                                    </Link>
                                ) : (
                                    "No business found"
                                )}
                            </p>
                        ) : null}
                        <p>{action.note}</p>
                        <RefList refs={action.refs} labelOf={refLabel} />
                        {!open ? (
                            <p className="text-muted-foreground">
                                Resolved {istDateTime(action.resolvedAt)}
                                {action.resolution
                                    ? `: ${action.resolution}`
                                    : ""}
                            </p>
                        ) : null}
                        {open && canAct ? (
                            <div className="flex flex-wrap gap-2">
                                {canRecheckRefund(action) &&
                                action.refs.payment ? (
                                    <RecheckRefund
                                        providerPaymentId={action.refs.payment}
                                    />
                                ) : null}
                                <ResolveAction id={action.id} label={label} />
                            </div>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Failed `billing.*` jobs, beside the queue: the Billing role has no Jobs
 * screen, so it sees them here and asks Operations to retry.
 */
export function FailedJobList({ jobs }: { jobs: FailedBillingJob[] }) {
    return (
        <ul className="grid gap-1.5 text-sm">
            {jobs.map((job) => (
                <li
                    key={job.id}
                    className="grid gap-0.5 border-b pb-1.5 last:border-b-0"
                >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-mono text-[12px]">
                            {job.type}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                            Failed {istDateTime(job.failedAt)} · {job.attempts}{" "}
                            of {job.maxAttempts} tries
                        </span>
                    </div>
                    <p className="text-muted-foreground">
                        {job.organization?.name ?? "No business"}
                        {job.lastError ? ` · ${job.lastError}` : ""}
                    </p>
                </li>
            ))}
        </ul>
    );
}
