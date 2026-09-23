"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import {
    reinstateAction,
    scheduleDeletionAction,
    suspendAction,
} from "@/lib/business-actions";
import type { LifecycleStatus } from "@/lib/businesses";

import { OperatorDialog } from "../operator-dialog";

/**
 * Suspend, lift, schedule deletion, cancel deletion. Each states what it
 * will do before it does it; the two that take a business down need its name
 * typed back. Nothing here deletes anything — deletion only starts a window.
 */
export function LifecycleActions({
    organizationId,
    name,
    status,
}: {
    organizationId: string;
    name: string;
    status: LifecycleStatus;
}) {
    if (status === "DELETED_RETAINED") {
        return (
            <p className="text-sm text-muted-foreground">
                This business has been deleted. Its record is kept; nothing can
                be changed.
            </p>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {status === "ACTIVE" && (
                <OperatorDialog
                    trigger="Suspend"
                    title={`Suspend ${name}`}
                    effect={
                        <p>
                            Its people can still sign in and see everything, but
                            nothing new happens: no changes in the workspace,
                            and no enquiries, bookings or payments from its
                            pages. Its site stays up. You can lift this at any
                            time.
                        </p>
                    }
                    confirmName={name}
                    destructive
                    submitLabel="Suspend business"
                    onSubmit={({ reason, idempotencyKey, values }) =>
                        suspendAction(organizationId, {
                            reason,
                            idempotencyKey,
                            confirmName: values.confirmName ?? "",
                        })
                    }
                />
            )}
            {status === "SUSPENDED" && (
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
            {status === "PENDING_DELETION" && (
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
            {status !== "PENDING_DELETION" && (
                <OperatorDialog
                    trigger="Schedule deletion"
                    triggerVariant="ghost"
                    title={`Schedule deletion of ${name}`}
                    effect={
                        <p>
                            Nothing is deleted now. The business stops taking
                            new activity at once, and the deletion can be
                            cancelled until the window ends.
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
    );
}
