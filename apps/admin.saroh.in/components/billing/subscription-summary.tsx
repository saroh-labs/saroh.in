"use client";

import { CopyButton } from "@saroh/ui/copy-button";
import type { ReactNode } from "react";

import { canEndAutopay } from "@/lib/billing-action-words";
import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import { cycleLabel, istDate, istDateTime } from "@/lib/billing-words";
import { autopayLine, priceLine } from "@/lib/subscription-sheet";

import { ActionList } from "./action-list";
import {
    EndAutopay,
    RecheckRefund,
    RecordRefund,
    SyncCustomer,
} from "./billing-controls";
import { RazorpayId } from "./razorpay-id";

/** The one line under "Do something" (R27). */
export const ACTIONS_NOTE =
    "Every action asks for a reason and goes in the audit trail. Refunds are made in Razorpay.";

/**
 * The subscription sheet's Summary tab (U15, R27): the facts an operator
 * reads first, then "Do something", today's four actions only (End
 * autopay, Sync the customer, Record a refund made by hand, Re-check a
 * refund), each an `OperatorDialog` with its reason. No pay link and no
 * more time (owner, 18 Oct). An action that doesn't fit this business
 * says why in place of its button. Open Needs-action rows follow.
 */
export function SubscriptionSummary({
    detail,
    canAct,
    onDone,
}: {
    detail: SarohSubscriptionDetail;
    canAct: boolean;
    /** A write went through: the sheet says so and lights the row. */
    onDone?: (message: string) => void;
}) {
    const sub = detail.subscription;
    const profile = detail.billingProfile;
    return (
        <div className="grid gap-6 text-sm">
            <Facts
                rows={[
                    [
                        "Plan",
                        `${sub.plan.name} · ${cycleLabel(sub.billingCycle)} · version ${sub.plan.version}`,
                    ],
                    ["Price", priceLine(detail)],
                    ["Paid until", istDate(sub.currentPeriodEnd)],
                    ["Autopay", autopayLine(sub)],
                    [
                        "Billing profile",
                        profile ? (
                            <ProfileFacts profile={profile} />
                        ) : (
                            <span className="text-muted-foreground">
                                None yet. An owner chooses one in Plan &amp;
                                billing before paying.
                            </span>
                        ),
                    ],
                    ["Billing email", profile ? profile.billingEmail : "—"],
                    [
                        "Razorpay subscription",
                        <CopyableId
                            key="sub"
                            id={sub.providerSubscriptionId}
                            provider={sub.provider}
                            what="subscription id"
                        />,
                    ],
                    [
                        "Razorpay customer",
                        <CopyableId
                            key="cust"
                            id={
                                profile?.providerCustomerId ??
                                sub.providerCustomerId
                            }
                            provider={profile?.provider ?? sub.provider}
                            what="customer id"
                        />,
                    ],
                ]}
            />

            <section className="grid gap-3" aria-labelledby="do-something">
                <h3 id="do-something" className="font-medium">
                    Do something
                </h3>
                {canAct ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ActionCard
                            title="End autopay"
                            line={`Stop the charges. ${sub.organization.name} keeps ${sub.plan.name} to the end of what it paid for, then moves to Free.`}
                        >
                            {canEndAutopay(sub) ? (
                                <EndAutopay
                                    subscriptionId={sub.id}
                                    businessName={sub.organization.name}
                                    planName={sub.plan.name}
                                    paidUntil={sub.currentPeriodEnd}
                                    onDone={() =>
                                        onDone?.(
                                            `${sub.organization.name}'s autopay ended. They keep ${sub.plan.name} to ${istDate(sub.currentPeriodEnd)}.`,
                                        )
                                    }
                                />
                            ) : (
                                <Why>No autopay is running to end.</Why>
                            )}
                        </ActionCard>
                        <ActionCard
                            title="Sync the customer"
                            line="Send the billing profile's name, email, phone and GSTIN to its Razorpay customer again."
                        >
                            {profile ? (
                                <SyncCustomer
                                    organizationId={sub.organization.id}
                                    onDone={() =>
                                        onDone?.(
                                            `Syncing ${profile.legalName}'s Razorpay customer. A refusal shows here.`,
                                        )
                                    }
                                />
                            ) : (
                                <Why>No billing profile to sync yet.</Why>
                            )}
                        </ActionCard>
                        <ActionCard
                            title="Record a refund made by hand"
                            line={
                                detail.invoices[0]
                                    ? `On the last invoice, ${detail.invoices[0].number}. For an older one, open Invoices.`
                                    : "Keeps a refund already made in Razorpay against its invoice."
                            }
                        >
                            {detail.invoices[0] ? (
                                <RecordRefund
                                    invoiceId={detail.invoices[0].id}
                                    invoiceNumber={detail.invoices[0].number}
                                    providerPaymentId={
                                        detail.invoices[0].providerPaymentId
                                    }
                                    totalPaise={detail.invoices[0].totalPaise}
                                    onDone={() =>
                                        onDone?.(
                                            `Refund recorded on ${detail.invoices[0]?.number ?? "the invoice"}.`,
                                        )
                                    }
                                />
                            ) : (
                                <Why>No invoice yet.</Why>
                            )}
                        </ActionCard>
                        <ActionCard
                            title="Re-check a refund"
                            line="Ask Razorpay again about a double charge's refund. It never refunds twice."
                        >
                            <RecheckList detail={detail} onDone={onDone} />
                        </ActionCard>
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        Your access lets you read Saroh&apos;s billing, not
                        change it.
                    </p>
                )}
                <p className="text-muted-foreground">{ACTIONS_NOTE}</p>
            </section>

            {detail.openActions.length > 0 ? (
                <section className="grid gap-2">
                    <h3 className="font-medium">Needs action</h3>
                    <ActionList
                        items={detail.openActions}
                        canAct={canAct}
                        showBusiness={false}
                    />
                </section>
            ) : null}
        </div>
    );
}

function RecheckList({
    detail,
    onDone,
}: {
    detail: SarohSubscriptionDetail;
    onDone?: (message: string) => void;
}) {
    const owed = detail.doubleCharges.filter((d) => !d.refundedAt);
    if (owed.length === 0) return <Why>No refund is waiting.</Why>;
    return (
        <div className="grid gap-2">
            {owed.map((d) => (
                <div
                    key={d.providerPaymentId}
                    className="flex flex-wrap items-center gap-2"
                >
                    <RazorpayId
                        id={d.providerPaymentId}
                        provider={d.provider || "RAZORPAY"}
                    />
                    <RecheckRefund
                        providerPaymentId={d.providerPaymentId}
                        onDone={() =>
                            onDone?.(
                                `Asked Razorpay again about ${d.providerPaymentId}.`,
                            )
                        }
                    />
                </div>
            ))}
        </div>
    );
}

function ActionCard({
    title,
    line,
    children,
}: {
    title: string;
    line: string;
    children: ReactNode;
}) {
    return (
        <div className="grid content-start gap-2 rounded-lg border p-3">
            <h4 className="font-medium">{title}</h4>
            <p className="text-muted-foreground">{line}</p>
            <div>{children}</div>
        </div>
    );
}

function Why({ children }: { children: ReactNode }) {
    return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

/** A provider id: its dashboard link and a copy button; "None" without. */
function CopyableId({
    id,
    provider,
    what,
}: {
    id: string | null;
    provider: string | null;
    what: string;
}) {
    if (!id) return <span className="text-muted-foreground">None</span>;
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-2">
            <RazorpayId id={id} provider={provider} />
            <CopyButton
                value={id}
                label="Copy"
                thing={what}
                variant="ghost"
                aria-label={`Copy the ${what}`}
            />
        </span>
    );
}

/**
 * Who Saroh bills the business to (DEC-167): the profile's legal name,
 * its GSTIN, its last sync, and the other businesses on it.
 */
export function ProfileFacts({
    profile,
}: {
    profile: NonNullable<SarohSubscriptionDetail["billingProfile"]>;
}) {
    return (
        <span className="grid gap-0.5">
            <span className="font-medium">{profile.legalName}</span>
            <span className="text-muted-foreground">
                {profile.gstin ? `GSTIN ${profile.gstin}` : "No GSTIN"}
                {" · "}
                {profile.syncedAt
                    ? `last synced ${istDateTime(profile.syncedAt)}`
                    : "never synced"}
                {profile.contactWithheld
                    ? " · made without the phone (another customer already has it)"
                    : ""}
            </span>
            {profile.lastError ? (
                <span className="text-destructive">Last sync failed.</span>
            ) : null}
            <span className="text-muted-foreground">
                {profile.otherBusinesses.length === 0
                    ? "Bills only this business."
                    : `Also bills ${profile.otherBusinesses
                          .map((b) => b.name)
                          .join(", ")}.`}
            </span>
        </span>
    );
}

/** Label and value rows; a row with nothing to say is left out. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5">
            {rows
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="min-w-0">{value}</dd>
                    </div>
                ))}
        </dl>
    );
}
