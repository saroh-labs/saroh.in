"use client";

import { Label } from "@saroh/ui/label";

import {
    changeMemberRoleAction,
    endSessionsAction,
    removeMemberAction,
    resendInvitationAction,
    withdrawInvitationAction,
} from "@/lib/people-actions";

import { OperatorDialog } from "../operator-dialog";

const BUILT_IN_ROLES = [
    { value: "OWNER", label: "Owner" },
    { value: "ADMIN", label: "Admin" },
    { value: "MEMBER", label: "Member" },
    { value: "REVIEWER", label: "Reviewer" },
];

export function EndSessions({
    userId,
    count,
}: {
    userId: string;
    count: number;
}) {
    return (
        <OperatorDialog
            trigger="Sign out everywhere"
            triggerVariant="outline"
            title="Sign them out everywhere"
            effect={`Ends ${count === 1 ? "their one open session" : `all ${count} of their open sessions`}. Their next request asks them to sign in again. Use this when an account may be compromised.`}
            destructive
            disabled={count === 0}
            disabledReason="They have no open sessions."
            submitLabel="End sessions"
            onSubmit={({ reason, idempotencyKey }) =>
                endSessionsAction(userId, { reason, idempotencyKey })
            }
        />
    );
}

/**
 * Change someone's role in one business. The business's own rule holds: it
 * always keeps an owner, so the last one cannot be moved off it.
 */
export function ChangeRole({
    organizationId,
    userId,
    name,
    role,
}: {
    organizationId: string;
    userId: string;
    name: string;
    role: string;
}) {
    return (
        <OperatorDialog
            trigger="Change role"
            triggerVariant="ghost"
            title={`Change ${name}'s role`}
            effect="The business's history records the change under your name, and the trail records your reason."
            fields={
                <div className="grid gap-1.5">
                    <Label htmlFor={`role-${userId}`}>New role</Label>
                    <select
                        id={`role-${userId}`}
                        name="role"
                        defaultValue={role}
                        className="h-[38px] w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                    >
                        {BUILT_IN_ROLES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                        {!BUILT_IN_ROLES.some(
                            (option) => option.value === role,
                        ) && <option value={role}>{role}</option>}
                    </select>
                </div>
            }
            submitLabel="Change role"
            onSubmit={({ reason, idempotencyKey, values }) =>
                changeMemberRoleAction(organizationId, userId, {
                    reason,
                    idempotencyKey,
                    role: values.role ?? role,
                })
            }
        />
    );
}

export function RemoveMember({
    organizationId,
    userId,
    name,
    business,
}: {
    organizationId: string;
    userId: string;
    name: string;
    business: string;
}) {
    return (
        <OperatorDialog
            trigger="Remove"
            triggerVariant="ghost"
            title={`Remove ${name} from ${business}`}
            effect="They lose access to this business at once, and their share links stop working. Their account and other businesses are untouched."
            destructive
            submitLabel="Remove from business"
            onSubmit={({ reason, idempotencyKey }) =>
                removeMemberAction(organizationId, userId, {
                    reason,
                    idempotencyKey,
                })
            }
        />
    );
}

export function InvitationActions({
    organizationId,
    invitationId,
    label,
}: {
    organizationId: string;
    invitationId: string;
    label: string;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            <OperatorDialog
                trigger="Resend"
                triggerVariant="ghost"
                title={`Resend the invitation to ${label}`}
                effect="A fresh link goes out and the old one stops working."
                submitLabel="Resend"
                onSubmit={({ reason, idempotencyKey }) =>
                    resendInvitationAction(organizationId, invitationId, {
                        reason,
                        idempotencyKey,
                    })
                }
            />
            <OperatorDialog
                trigger="Withdraw"
                triggerVariant="ghost"
                title={`Withdraw the invitation to ${label}`}
                effect="Its link stops working. Nothing else changes."
                destructive
                submitLabel="Withdraw"
                onSubmit={({ reason, idempotencyKey }) =>
                    withdrawInvitationAction(organizationId, invitationId, {
                        reason,
                        idempotencyKey,
                    })
                }
            />
        </div>
    );
}
