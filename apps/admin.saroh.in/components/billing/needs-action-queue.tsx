"use client";

import { Badge } from "@saroh/ui/badge";
import { buttonVariants } from "@saroh/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { ChangedRow } from "@/components/changed-row";
import { OperatorDialog } from "@/components/operator-dialog";
import { EmptyPanel } from "@/components/states/empty-panel";
import type {
    ActionTone,
    BillingActionRow,
    FailedBillingJob,
} from "@/lib/billing-action-words";
import {
    actionWords,
    canRecheckRefund,
    jobLabel,
    jobsHref,
    RAZORPAY_LINK_HINT,
    razorpayDashboardUrl,
    refLabel,
} from "@/lib/billing-action-words";
import { retryBillingJobAction } from "@/lib/billing-actions";
import { istDateTime } from "@/lib/billing-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { businessBillingHref } from "./action-list";
import { RecheckRefund, ResolveAction } from "./billing-controls";
import { RefList } from "./razorpay-id";

/** The all-clear, when nothing is open (R28). */
export const ALL_CLEAR_TITLE = "All clear";
export const ALL_CLEAR_LINE =
    "Nothing needs action. A row appears when Saroh's billing meets something it can't settle by itself.";

const TONE: Record<ActionTone, "error" | "warning" | "neutral"> = {
    danger: "error",
    warning: "warning",
    neutral: "neutral",
};

/**
 * Billing › Needs action (R28): every billing problem an operator must act
 * on, oldest open first, each with what happened in one sentence and its
 * one fix, then Mark resolved. What Saroh recorded (the API's note and the
 * provider's ids) sits under the sentence. The failed `billing.*` jobs
 * follow; Retry runs one again in place, through the console's job retry,
 * and the row says it was queued, highlighted.
 */
export function NeedsActionQueue({
    items,
    failedJobs,
    canAct,
    canRetry,
    canOpenJobs,
    empty,
    children,
}: {
    items: BillingActionRow[];
    failedJobs: FailedBillingJob[];
    /** Holds `saroh-billing:act`: the fixes and Mark resolved. */
    canAct: boolean;
    /** Holds `jobs:retry`: Retry on a failed job. */
    canRetry: boolean;
    /** Holds `jobs:read`: Open in Jobs. */
    canOpenJobs: boolean;
    /** What an empty list says instead of the all-clear (a search, Resolved). */
    empty?: ReactNode;
    /** Below the list: its pager. */
    children?: ReactNode;
}) {
    return (
        <>
            {items.length === 0 ? (
                (empty ?? (
                    <EmptyPanel
                        title={ALL_CLEAR_TITLE}
                        description={ALL_CLEAR_LINE}
                    />
                ))
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Oldest first. Each says what happened and the one thing
                        to do. {RAZORPAY_LINK_HINT}
                    </p>
                    <ul className="grid gap-2" aria-label="Needs action">
                        {items.map((action) => (
                            <ActionRow
                                key={action.id}
                                action={action}
                                canAct={canAct}
                            />
                        ))}
                    </ul>
                    {children}
                </>
            )}
            <FailedJobs
                jobs={failedJobs}
                canRetry={canRetry}
                canOpenJobs={canOpenJobs}
            />
        </>
    );
}

function ActionRow({
    action,
    canAct,
}: {
    action: BillingActionRow;
    canAct: boolean;
}) {
    const words = actionWords(action.code);
    const open = !action.resolvedAt;
    return (
        <li className="grid gap-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge variant={TONE[words.tone]} size="sm">
                    {words.label}
                </Badge>
                <span className="font-medium">
                    {action.organization ? (
                        <Link
                            href={businessBillingHref(action.organization.slug)}
                            className="underline-offset-4 hover:underline"
                        >
                            {action.organization.name}
                        </Link>
                    ) : (
                        "No business found"
                    )}
                </span>
                <span className="text-[12px] text-muted-foreground">
                    Raised {istDateTime(action.createdAt)}
                </span>
            </div>
            <p>{words.what}</p>
            <details className="text-muted-foreground">
                <summary className="cursor-pointer text-[13px]">
                    What Saroh recorded
                </summary>
                <div className="mt-1.5 grid gap-1.5">
                    <p>{action.note}</p>
                    <RefList refs={action.refs} labelOf={refLabel} />
                </div>
            </details>
            {!open ? (
                <p className="text-muted-foreground">
                    Resolved {istDateTime(action.resolvedAt)}
                    {action.resolution ? `: ${action.resolution}` : ""}
                </p>
            ) : null}
            {open ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Fix action={action} canAct={canAct} />
                    {canAct ? (
                        <ResolveAction id={action.id} label={words.label} />
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

/** The row's one fix, or the subscription when its id is missing. */
function Fix({
    action,
    canAct,
}: {
    action: BillingActionRow;
    canAct: boolean;
}) {
    const { fix } = actionWords(action.code);
    const link = buttonVariants({ variant: "outline", size: "sm" });
    const subscription = action.organization ? (
        <Link
            href={businessBillingHref(action.organization.slug)}
            className={link}
        >
            Open the subscription
        </Link>
    ) : null;

    if (fix.kind === "recheck") {
        if (canAct && canRecheckRefund(action) && action.refs.payment) {
            return <RecheckRefund providerPaymentId={action.refs.payment} />;
        }
        return subscription;
    }
    if (fix.kind === "razorpay") {
        const href = razorpayDashboardUrl(
            action.refs[fix.ref],
            "provider" in action.refs ? action.refs.provider : "RAZORPAY",
        );
        if (!href) return subscription;
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={link}
            >
                {fix.label}
            </a>
        );
    }
    if (fix.kind === "invoice") {
        if (!action.refs.invoice) return subscription;
        return (
            <Link
                href={`/billing/invoices?q=${encodeURIComponent(action.refs.invoice)}`}
                className={link}
            >
                {fix.label}
            </Link>
        );
    }
    if (fix.kind === "resolve") {
        return <span className="text-muted-foreground">{fix.label}.</span>;
    }
    return subscription;
}

/**
 * Failed `billing.*` jobs, beside the queue. Retry (`jobs:retry`) asks a
 * reason and runs the job again in place; the row stays, says it was
 * queued and lights for two seconds. "Open in Jobs" is the way to the
 * whole job, for whoever opens Jobs.
 */
function FailedJobs({
    jobs,
    canRetry,
    canOpenJobs,
}: {
    jobs: FailedBillingJob[];
    canRetry: boolean;
    canOpenJobs: boolean;
}) {
    const feedback = useChangeFeedback();
    // Jobs queued again from here: they stay, saying so, until a refresh.
    const [retried, setRetried] = useState<ReadonlySet<string>>(
        () => new Set(),
    );

    return (
        <section className="grid gap-2" aria-label="Failed billing jobs">
            <h2 className="font-medium">Failed billing jobs</h2>
            {jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No billing job has failed.
                </p>
            ) : (
                <>
                    {!canRetry ? (
                        <p className="text-sm text-muted-foreground">
                            Running one again needs the Jobs retry, which
                            Billing doesn&apos;t hold: ask Operations or a
                            Platform Owner.
                        </p>
                    ) : null}
                    <ul className="grid gap-1.5 text-sm">
                        {jobs.map((job) => {
                            const done = retried.has(job.id);
                            return (
                                <ChangedRow
                                    as="li"
                                    key={job.id}
                                    changed={feedback.isHighlighted(job.id)}
                                    data-job-id={job.id}
                                    className="grid gap-1 rounded-md border-b px-1 pb-1.5 last:border-b-0"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="font-medium">
                                            {jobLabel(job.type)}{" "}
                                            <span className="font-mono text-[12px] font-normal text-muted-foreground">
                                                {job.type}
                                            </span>
                                        </span>
                                        <span className="text-[12px] text-muted-foreground">
                                            Failed {istDateTime(job.failedAt)} ·{" "}
                                            {job.attempts} of {job.maxAttempts}{" "}
                                            tries
                                        </span>
                                    </div>
                                    <p className="text-muted-foreground">
                                        {job.organization?.name ??
                                            "No business"}
                                        {job.lastError
                                            ? ` · ${job.lastError}`
                                            : ""}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {done ? (
                                            <span role="status">
                                                Queued to run again
                                            </span>
                                        ) : canRetry ? (
                                            <OperatorDialog
                                                trigger="Retry"
                                                triggerVariant="outline"
                                                title={`Run "${jobLabel(job.type)}" again`}
                                                effect="Saroh checks the job again and queues it to run once more, from its first try. A job for a suspended or closing business is not run."
                                                submitLabel="Run it again"
                                                onSubmit={async ({
                                                    reason,
                                                    idempotencyKey,
                                                }) => {
                                                    const result =
                                                        await retryBillingJobAction(
                                                            {
                                                                jobId: job.id,
                                                                reason,
                                                                idempotencyKey,
                                                            },
                                                        );
                                                    if (!result.ok)
                                                        return result;
                                                    if (
                                                        result.data.status ===
                                                        "SKIPPED"
                                                    ) {
                                                        return {
                                                            ok: false,
                                                            error:
                                                                result.data
                                                                    .detail ??
                                                                "It wasn't run again.",
                                                        };
                                                    }
                                                    setRetried((now) =>
                                                        new Set(now).add(
                                                            job.id,
                                                        ),
                                                    );
                                                    feedback.report({
                                                        message: `${jobLabel(job.type)} queued to run again.`,
                                                        rowId: job.id,
                                                    });
                                                    return { ok: true };
                                                }}
                                            />
                                        ) : null}
                                        {canOpenJobs ? (
                                            <Link
                                                href={jobsHref(job.type)}
                                                className="text-[13px] underline underline-offset-4"
                                            >
                                                Open in Jobs
                                            </Link>
                                        ) : null}
                                    </div>
                                </ChangedRow>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}
