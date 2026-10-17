"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId } from "react";

import { rupeesToPaise } from "@/lib/billing-action-words";
import {
    endAutopayAction,
    recheckRefundAction,
    recordRefundAction,
    resolveBillingActionAction,
    syncCustomerAction,
} from "@/lib/billing-actions";
import { formatPaise, istDate } from "@/lib/billing-words";

import { OperatorDialog } from "../operator-dialog";

/**
 * Admin › Billing's writes (DEC-166), one `OperatorDialog` each: what will
 * change, a reason for the ledger, one idempotency key per attempt. Shown
 * only to operators holding `saroh-billing:act`; the API refuses anyone
 * else regardless.
 */

/** Close a Needs-action row. */
export function ResolveAction({ id, label }: { id: string; label: string }) {
    return (
        <OperatorDialog
            trigger="Mark resolved"
            triggerVariant="ghost"
            title={`Mark "${label}" resolved`}
            effect="It leaves Needs action and goes on the record with your reason. Nothing changes at the billing provider or for the business."
            submitLabel="Mark resolved"
            reasonLabel="What was done (kept in the audit trail)"
            onSubmit={({ reason, idempotencyKey }) =>
                resolveBillingActionAction({ id, reason, idempotencyKey })
            }
        />
    );
}

/** Ask the provider again about a double charge's refund. */
export function RecheckRefund({
    providerPaymentId,
}: {
    providerPaymentId: string;
}) {
    return (
        <OperatorDialog
            trigger="Check the refund again"
            triggerVariant="ghost"
            title={`Check the refund of ${providerPaymentId} again`}
            effect="Saroh asks the billing provider again. If the payment is already refunded in full (by hand, say), it is recorded as refunded and the business is emailed, without refunding twice; otherwise Saroh tries the refund once more."
            submitLabel="Check again"
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await recheckRefundAction({
                    providerPaymentId,
                    reason,
                    idempotencyKey,
                });
                if (result.ok && result.data.already === "refunded") {
                    return {
                        ok: false,
                        error: "It is already recorded as refunded. Nothing to do.",
                    };
                }
                return result;
            }}
        />
    );
}

/** Send the business's details to the provider's customer again. */
export function SyncCustomer({ organizationId }: { organizationId: string }) {
    return (
        <OperatorDialog
            trigger="Sync again"
            triggerVariant="outline"
            title="Sync the Razorpay customer again"
            effect="Saroh sends the business's billing name, email, phone and GSTIN to its customer at the billing provider, in the background. A refusal shows here as the last error."
            submitLabel="Sync again"
            onSubmit={({ reason, idempotencyKey }) =>
                syncCustomerAction({ organizationId, reason, idempotencyKey })
            }
        />
    );
}

/** End a business's autopay, keeping what it has paid for. */
export function EndAutopay({
    subscriptionId,
    businessName,
    planName,
    paidUntil,
}: {
    subscriptionId: string;
    businessName: string;
    planName: string;
    paidUntil: string | null;
}) {
    return (
        <OperatorDialog
            trigger="End autopay"
            triggerVariant="destructive"
            title={`End ${businessName}'s autopay`}
            effect={
                <div className="grid gap-2">
                    <p>
                        {businessName} keeps {planName} to the end of what it
                        has paid for
                        {paidUntil ? ` (${istDate(paidUntil)})` : ""}, then
                        moves to Free. The billing provider is told to stop
                        charging. Nothing is refunded.
                    </p>
                    <p>
                        The people who manage its billing are emailed. It is the
                        business&apos;s own Cancel plan, done by Saroh.
                    </p>
                </div>
            }
            confirmName={businessName}
            submitLabel="End autopay"
            destructive
            onSubmit={({ reason, idempotencyKey }) =>
                endAutopayAction({ subscriptionId, reason, idempotencyKey })
            }
        />
    );
}

/** Record a refund the owner made by hand in Razorpay. */
export function RecordRefund({
    invoiceId,
    invoiceNumber,
    providerPaymentId,
    totalPaise,
}: {
    invoiceId: string;
    invoiceNumber: string;
    providerPaymentId: string | null;
    totalPaise: number;
}) {
    const id = useId();
    return (
        <OperatorDialog
            trigger="Record a refund"
            triggerVariant="ghost"
            title={`Record a refund on ${invoiceNumber}`}
            effect={`For a refund already made in Razorpay. Saroh refunds nothing here: it keeps the refund against the invoice (total ${formatPaise(totalPaise)}) and adds "credit note may be needed" to Needs action, to ask the CA.`}
            submitLabel="Record refund"
            fields={
                <div className="grid gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-payment`}>Payment id</Label>
                        <Input
                            id={`${id}-payment`}
                            name="providerPaymentId"
                            defaultValue={providerPaymentId ?? ""}
                            placeholder="pay_…"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-refund`}>Refund id</Label>
                        <Input
                            id={`${id}-refund`}
                            name="providerRefundId"
                            placeholder="rfnd_…"
                            autoComplete="off"
                            required
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${id}-amount`}>
                            Amount refunded, in rupees
                        </Label>
                        <Input
                            id={`${id}-amount`}
                            name="amount"
                            inputMode="decimal"
                            autoComplete="off"
                            required
                        />
                    </div>
                </div>
            }
            onSubmit={({ reason, idempotencyKey, values }) => {
                const amountPaise = rupeesToPaise(values.amount);
                if (amountPaise === null) {
                    return Promise.resolve({
                        ok: false,
                        error: "Give the amount in rupees, like 1180 or 1180.50.",
                    });
                }
                return recordRefundAction({
                    invoiceId,
                    providerPaymentId: (values.providerPaymentId ?? "").trim(),
                    providerRefundId: (values.providerRefundId ?? "").trim(),
                    amountPaise,
                    reason,
                    idempotencyKey,
                });
            }}
        />
    );
}
