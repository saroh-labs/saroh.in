"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    liftLegalHoldAction,
    placeLegalHoldAction,
    reinstateAction,
    scheduleDeletionAction,
    suspendAction,
} from "@/lib/business-actions";
import type { LifecycleStatus } from "@/lib/businesses";
import { LEGAL_HOLD_MEANS } from "@/lib/deletion-words";

import { OperatorDialog } from "../operator-dialog";

/** The Suspend dialog's checkbox, in the owner's words (10 Oct). */
export const LEGAL_HOLD_CHECKBOX =
    "Suspended for activity the law prohibits — keep its data";

/**
 * Suspend, lift, schedule deletion, cancel deletion. Each states what it
 * will do before it does it; the two that take a business down need its name
 * typed back. Nothing here deletes anything — deletion only starts a window.
 *
 * A legal hold (DEC-122) is placed with the suspension (the checkbox), or on
 * a business already suspended or on its way out; only a Platform Owner is
 * offered Lift legal hold (`canLiftHold`). While it is held, lifting the
 * suspension, cancelling or scheduling deletion are not offered: the API
 * refuses them, and the line under the buttons says why.
 */
export function LifecycleActions({
    organizationId,
    name,
    status,
    held = false,
    canLiftHold = false,
}: {
    organizationId: string;
    name: string;
    status: LifecycleStatus;
    /** On legal hold. */
    held?: boolean;
    /** The operator may lift a hold (a Platform Owner). */
    canLiftHold?: boolean;
}) {
    const deleted = status === "DELETED_RETAINED";

    return (
        <div className="grid gap-2">
            {deleted && (
                <p className="text-sm text-muted-foreground">
                    This business has been deleted. Its record is kept; its
                    state can&rsquo;t be changed.
                </p>
            )}
            {held && (
                <p className="text-sm text-muted-foreground">
                    On legal hold: it can&rsquo;t be reinstated and its deletion
                    can&rsquo;t be scheduled until a Platform Owner lifts the
                    hold.
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {status === "ACTIVE" && (
                    <OperatorDialog
                        trigger="Suspend"
                        title={`Suspend ${name}`}
                        effect={
                            <p>
                                Its people can still sign in and see everything,
                                but nothing new happens: no changes in the
                                workspace, and no enquiries, bookings or
                                payments from its pages. Its site stays up. You
                                can lift this at any time, unless you place a
                                legal hold with it.
                            </p>
                        }
                        fields={
                            <div className="grid gap-1.5">
                                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                                    <input
                                        type="checkbox"
                                        name="legalHold"
                                        className="mt-0.5 size-4 accent-primary"
                                    />
                                    <span>{LEGAL_HOLD_CHECKBOX}</span>
                                </label>
                                <p className="text-[12.5px] text-muted-foreground">
                                    Places a legal hold, with the reason you
                                    give below. {LEGAL_HOLD_MEANS}
                                </p>
                            </div>
                        }
                        confirmName={name}
                        destructive
                        submitLabel="Suspend business"
                        onSubmit={({ reason, idempotencyKey, values }) =>
                            suspendAction(organizationId, {
                                reason,
                                idempotencyKey,
                                confirmName: values.confirmName ?? "",
                                legalHold: values.legalHold === "on",
                            })
                        }
                    />
                )}
                {status === "SUSPENDED" && !held && (
                    <OperatorDialog
                        trigger="Lift suspension"
                        triggerVariant="default"
                        title={`Lift the suspension on ${name}`}
                        effect="It can take new activity again from the next request."
                        submitLabel="Lift suspension"
                        onSubmit={({ reason, idempotencyKey }) =>
                            reinstateAction(organizationId, {
                                reason,
                                idempotencyKey,
                            })
                        }
                    />
                )}
                {status === "PENDING_DELETION" && !held && (
                    <OperatorDialog
                        trigger="Cancel deletion"
                        triggerVariant="default"
                        title={`Cancel the deletion of ${name}`}
                        effect="It returns to active and can take new activity again."
                        submitLabel="Cancel deletion"
                        onSubmit={({ reason, idempotencyKey }) =>
                            reinstateAction(organizationId, {
                                reason,
                                idempotencyKey,
                            })
                        }
                    />
                )}
                {status !== "ACTIVE" && !held && (
                    <OperatorDialog
                        trigger="Place legal hold"
                        title={`Place a legal hold on ${name}`}
                        effect={<p>{LEGAL_HOLD_MEANS}</p>}
                        reasonLabel="Why its data must be kept (kept in the audit trail)"
                        destructive
                        submitLabel="Place legal hold"
                        onSubmit={({ reason, idempotencyKey }) =>
                            placeLegalHoldAction(organizationId, {
                                reason,
                                idempotencyKey,
                            })
                        }
                    />
                )}
                {held && canLiftHold && (
                    <OperatorDialog
                        trigger="Lift legal hold"
                        title={`Lift the legal hold on ${name}`}
                        effect={
                            <p>
                                Its data is no longer protected: a scheduled
                                deletion goes ahead on the next daily run, a
                                deleted business is cleaned up and, 180 days
                                after it was deleted, erased. It stays in the
                                state it is in.
                            </p>
                        }
                        reasonLabel="Why the hold can be lifted (kept in the audit trail)"
                        destructive
                        submitLabel="Lift legal hold"
                        onSubmit={({ reason, idempotencyKey }) =>
                            liftLegalHoldAction(organizationId, {
                                reason,
                                idempotencyKey,
                            })
                        }
                    />
                )}
                {!deleted && !held && status !== "PENDING_DELETION" && (
                    <OperatorDialog
                        trigger="Schedule deletion"
                        triggerVariant="ghost"
                        title={`Schedule deletion of ${name}`}
                        effect={
                            <p>
                                Nothing is deleted now. The business stops
                                taking new activity at once, and the deletion
                                can be cancelled until the window ends. Within a
                                day of its end the business is marked deleted
                                and access ends: its site goes offline, its
                                people can&rsquo;t open it and its payment and
                                messaging keys are removed. Its data and files
                                are kept for 180 days more, then its files and
                                personal data are erased; invoices, credit notes
                                and orders stay as tax records.
                            </p>
                        }
                        fields={
                            <div className="grid gap-1.5">
                                <Label htmlFor="retention-days">
                                    Retention window (days)
                                </Label>
                                <Input
                                    id="retention-days"
                                    name="retentionDays"
                                    type="number"
                                    inputMode="numeric"
                                    min={7}
                                    max={90}
                                    defaultValue={30}
                                    required
                                />
                            </div>
                        }
                        confirmName={name}
                        destructive
                        submitLabel="Schedule deletion"
                        onSubmit={({ reason, idempotencyKey, values }) =>
                            scheduleDeletionAction(organizationId, {
                                reason,
                                idempotencyKey,
                                confirmName: values.confirmName ?? "",
                                retentionDays: Number(values.retentionDays),
                            })
                        }
                    />
                )}
            </div>
        </div>
    );
}
