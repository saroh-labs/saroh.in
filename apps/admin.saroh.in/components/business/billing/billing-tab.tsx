"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";

import { SyncCustomer } from "@/components/billing/billing-controls";
import { ChangedRow } from "@/components/changed-row";
import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import { formatPaise, istDate, istDateTime } from "@/lib/billing-words";
import { formatDate, plural } from "@/lib/format";
import type { OverviewPlan, OverviewUsageRow } from "@/lib/overview-words";
import {
    billedToLine,
    offerLine,
    overviewNextCharge,
    overviewPlanWords,
    priceLine,
} from "@/lib/overview-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { GiveOffer } from "../give-offer";

/**
 * Who it is billed to, read with `saroh-billing:read`: the subscription's
 * detail (DEC-167's profile, the last invoice), or why it isn't here.
 */
export type BillingSide =
    | { status: "ok"; detail: SarohSubscriptionDetail }
    /** No subscription row yet: the free basics, nothing billed. */
    | { status: "none" }
    | { status: "failed" }
    /** Not for this reader: only Platform owners and Billing see who pays. */
    | { status: "hidden" };

/**
 * A business's Billing tab (admin plan U5, R6): one row each for its plan,
 * the offers running, who it is billed to (its billing profile, DEC-167:
 * one profile may pay for several businesses, and this shows only this
 * business's), its limits and extras, and its last invoice, with the
 * subscription sheet a link away and Sync with Razorpay… beside the
 * profile. It reads without a support session (R10), so Billing staff
 * reach it as they reach Billing.
 *
 * Give a custom offer… opens the offer sheet over the tab; after it, or a
 * sync, the row it changed lights for two seconds.
 */
export function BillingTab({
    organizationId,
    businessName,
    plan,
    usage,
    billedTo,
    side,
    canOffer,
    canSync,
}: {
    organizationId: string;
    businessName: string;
    plan: OverviewPlan;
    usage: OverviewUsageRow[] | null;
    billedTo: { name: string | null } | null;
    side: BillingSide;
    /** Holds `pricing:override` or `subscription:override`. */
    canOffer: boolean;
    /** Holds `saroh-billing:act`. */
    canSync: boolean;
}) {
    const feedback = useChangeFeedback();
    const planName = (id: string) =>
        plan.livePlans?.find((p) => p.id === id)?.name ?? id;
    const sheet = plan.subscriptionId
        ? `/billing/subscriptions?open=${encodeURIComponent(plan.subscriptionId)}`
        : null;
    const changed = (usage ?? []).filter((row) => row.changed);

    return (
        <div className="grid divide-y divide-border" data-billing-tab>
            <Row
                id="plan"
                label="Plan"
                lit={feedback.isHighlighted("plan")}
                value={
                    <div className="grid gap-0.5">
                        <span>{overviewPlanWords(plan)}</span>
                        <span className="text-muted-foreground">
                            {[
                                priceLine(plan),
                                `next charge ${overviewNextCharge(plan)}`,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </div>
                }
                action={
                    canOffer ? (
                        <GiveOffer
                            organizationId={organizationId}
                            businessName={businessName}
                            variant="outline"
                            onDone={(message) =>
                                feedback.report({ message, rowId: "plan" })
                            }
                        />
                    ) : null
                }
            />
            <Row
                id="offers"
                label="Offers running"
                lit={feedback.isHighlighted("plan")}
                value={
                    plan.offers.length === 0 ? (
                        <span className="text-muted-foreground">
                            None. It gets what its plan gives.
                        </span>
                    ) : (
                        <ul className="grid gap-1">
                            {plan.offers.map((offer) => (
                                <li key={offer.id}>
                                    {offerLine(offer, planName)}
                                </li>
                            ))}
                        </ul>
                    )
                }
            />
            <BilledTo
                organizationId={organizationId}
                side={side}
                billedTo={billedTo}
                canSync={canSync}
                lit={feedback.isHighlighted("billed-to")}
                onSynced={() =>
                    feedback.report({
                        message: `Syncing ${businessName}'s Razorpay customer again.`,
                        rowId: "billed-to",
                    })
                }
            />
            <Row
                id="limits"
                label="Limits and extras"
                lit={false}
                value={
                    usage === null ? (
                        <span className="text-muted-foreground">
                            Its limits couldn&apos;t be read just now.
                        </span>
                    ) : changed.length === 0 ? (
                        <span>
                            Their plan&apos;s limits, nothing changed for them
                        </span>
                    ) : (
                        <ul className="grid gap-1">
                            {changed.map((row) => (
                                <li key={row.key}>
                                    {row.label}: {row.limit ?? "no limit"}
                                    {row.planLimit !== null
                                        ? ` (plan gives ${row.planLimit})`
                                        : ""}
                                    {row.changed?.expiresAt
                                        ? ` until ${formatDate(row.changed.expiresAt)}`
                                        : " until removed"}
                                </li>
                            ))}
                        </ul>
                    )
                }
            />
            {side.status === "ok" ? (
                <Row
                    id="last-invoice"
                    label="Last invoice"
                    lit={false}
                    value={lastInvoice(side.detail)}
                    action={
                        sheet ? (
                            <div className="flex flex-wrap gap-2">
                                <Button asChild size="sm" variant="ghost">
                                    <Link href={`${sheet}&sheet=invoices`}>
                                        All invoices
                                    </Link>
                                </Button>
                                <Button asChild size="sm" variant="outline">
                                    <Link href={sheet}>
                                        Open the subscription
                                    </Link>
                                </Button>
                            </div>
                        ) : null
                    }
                />
            ) : null}
        </div>
    );
}

function Row({
    id,
    label,
    value,
    action,
    lit,
}: {
    id: string;
    label: string;
    value: ReactNode;
    action?: ReactNode;
    lit: boolean;
}) {
    return (
        <ChangedRow
            changed={lit}
            data-billing-row={id}
            className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-start sm:gap-4"
        >
            <p className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
                {label}
            </p>
            <div className="min-w-0 flex-1 text-sm">{value}</div>
            {action ? <div className="sm:shrink-0">{action}</div> : null}
        </ChangedRow>
    );
}

function BilledTo({
    organizationId,
    side,
    billedTo,
    canSync,
    lit,
    onSynced,
}: {
    organizationId: string;
    side: BillingSide;
    billedTo: { name: string | null } | null;
    canSync: boolean;
    lit: boolean;
    onSynced: () => void;
}) {
    if (side.status === "hidden") {
        return (
            <Row
                id="billed-to"
                label="Billed to"
                lit={false}
                value={
                    <span className="text-muted-foreground">
                        Who pays, and their invoices, need Saroh billing access.
                    </span>
                }
            />
        );
    }
    if (side.status === "failed") {
        return (
            <Row
                id="billed-to"
                label="Billed to"
                lit={false}
                value={
                    <span className="text-muted-foreground">
                        {billedTo?.name ?? "Couldn't be read just now."} Its
                        billing details couldn&apos;t be loaded; nothing has
                        changed.
                    </span>
                }
            />
        );
    }
    const profile = side.status === "ok" ? side.detail.billingProfile : null;
    if (!profile) {
        return (
            <Row
                id="billed-to"
                label="Billed to"
                lit={lit}
                value={<span>{billedToLine(billedTo ?? { name: null })}</span>}
            />
        );
    }
    const others = profile.otherBusinesses.length;
    return (
        <Row
            id="billed-to"
            label="Billed to"
            lit={lit}
            value={
                <div className="grid gap-0.5">
                    <span>
                        {[
                            profile.legalName,
                            profile.gstin ? "GSTIN on file" : "no GSTIN",
                            profile.billingEmail,
                        ].join(" · ")}
                    </span>
                    {others > 0 && (
                        <span className="text-muted-foreground">
                            The same profile also pays for{" "}
                            {plural(
                                others,
                                "other business",
                                "other businesses",
                            )}
                            :{" "}
                            {profile.otherBusinesses
                                .map((b) => b.name)
                                .join(", ")}
                        </span>
                    )}
                    <span className="text-muted-foreground" data-sync>
                        {profile.lastError
                            ? `Razorpay refused the last sync: ${profile.lastError}`
                            : profile.syncedAt
                              ? `Synced with Razorpay ${istDateTime(profile.syncedAt)}`
                              : "Not synced with Razorpay yet"}
                    </span>
                </div>
            }
            action={
                canSync ? (
                    <SyncCustomer
                        organizationId={organizationId}
                        trigger="Sync with Razorpay…"
                        onDone={onSynced}
                    />
                ) : null
            }
        />
    );
}

function lastInvoice(detail: SarohSubscriptionDetail): ReactNode {
    const last = detail.subscription.lastInvoice;
    if (!last) {
        return <span className="text-muted-foreground">None issued yet</span>;
    }
    return (
        <span>
            {last.number} · {formatPaise(last.totalPaise)} ·{" "}
            {istDate(last.issuedAt)}
        </span>
    );
}
