"use client";

import { DateInput, isoFromDate } from "@saroh/ui/date-picker";
import { Label } from "@saroh/ui/label";

import type { AdminRole } from "@/lib/control-plane";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL, ROLE_PURPOSE } from "@/lib/roles";
import type { StaffInvite, StaffMember } from "@/lib/staff";
import {
    amendStaffAction,
    resendInviteAction,
    revokeStaffAction,
    withdrawInviteAction,
} from "@/lib/team-actions";

import { OperatorDialog } from "../operator-dialog";

export const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];

/**
 * The console roles, each with what it is for. Uncontrolled with
 * `selected` (Change); controlled with `value` and `onChange` (Add a
 * teammate, which ticks the suggested role for the job). `suggested`
 * marks one role as the job's suggestion.
 */
export function RolePicker({
    selected = [],
    value,
    onChange,
    suggested,
}: {
    selected?: AdminRole[];
    value?: AdminRole[];
    onChange?: (roles: AdminRole[]) => void;
    suggested?: AdminRole;
}) {
    const controlled = value !== undefined;
    return (
        <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Console roles</legend>
            {ROLES.map((role) => (
                <label
                    key={role}
                    className="flex items-start gap-2.5 text-sm coarse:min-h-11"
                >
                    <input
                        type="checkbox"
                        name="roles"
                        value={role}
                        {...(controlled
                            ? {
                                  checked: value.includes(role),
                                  onChange: (e) =>
                                      onChange?.(
                                          e.target.checked
                                              ? [...value, role]
                                              : value.filter((r) => r !== role),
                                      ),
                              }
                            : { defaultChecked: selected.includes(role) })}
                        className="mt-0.5 size-4 accent-foreground"
                    />
                    <span>
                        <span className="font-medium">{ROLE_LABEL[role]}</span>
                        {suggested === role && (
                            <span className="ml-2 text-[12px] font-medium text-muted-foreground">
                                Suggested for their job
                            </span>
                        )}
                        <span className="block text-[13px] text-muted-foreground">
                            {ROLE_PURPOSE[role]}
                        </span>
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

/** Today, as the date picker writes it. */
export function todayIsoLocal(): string {
    return isoFromDate(new Date());
}

function ExpiryField({ defaultValue }: { defaultValue?: string }) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor="staff-expiry">Access ends (optional)</Label>
            <DateInput
                id="staff-expiry"
                className="w-full"
                name="expiresOn"
                defaultValue={defaultValue}
                min={todayIsoLocal()}
                clearable
                placeholder="No end date"
            />
            <p className="text-[13px] text-muted-foreground">
                Leave empty for access that lasts until someone revokes it.
            </p>
        </div>
    );
}

/** A date input's day, as the end of that day in the operator's own time. */
export function endOfDay(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const date = new Date(`${value}T23:59:59`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function rolesFrom(form: FormData): string[] {
    return form
        .getAll("roles")
        .filter((value): value is string => typeof value === "string");
}

export function AmendStaff({ member }: { member: StaffMember }) {
    const expiry = member.roles.find((role) => role.expiresAt)?.expiresAt;
    return (
        <OperatorDialog
            trigger="Change"
            triggerVariant="ghost"
            title={`Change ${member.name ?? member.email}'s access`}
            effect="Roles you untick end now; roles you tick start now. The last Platform Owner cannot be removed or given an end date."
            fields={
                <>
                    <RolePicker
                        selected={member.roles.map((role) => role.role)}
                    />
                    <ExpiryField defaultValue={expiry?.slice(0, 10)} />
                </>
            }
            submitLabel="Save access"
            onSubmit={({ reason, idempotencyKey, values, form }) =>
                amendStaffAction(member.platformAdminId, {
                    roles: rolesFrom(form),
                    reason,
                    expiresAt: endOfDay(values.expiresOn),
                    idempotencyKey,
                })
            }
        />
    );
}

export function RevokeStaff({ member }: { member: StaffMember }) {
    return (
        <OperatorDialog
            trigger="Revoke"
            triggerVariant="ghost"
            title={`Revoke ${member.name ?? member.email}'s access`}
            effect="Their next request to the console is refused, and any business they have open for support closes."
            confirmName={member.email}
            destructive
            submitLabel="Revoke access"
            onSubmit={({ reason, idempotencyKey }) =>
                revokeStaffAction(member.platformAdminId, {
                    reason,
                    idempotencyKey,
                })
            }
        />
    );
}

/** Send an invite again with a new link (U24); the old link stops working. */
export function ResendInvite({
    invite,
    onDone,
}: {
    invite: StaffInvite;
    onDone?: (message: string) => void;
}) {
    return (
        <OperatorDialog
            trigger="Resend…"
            triggerVariant="ghost"
            title={`Send ${invite.name}'s invite again?`}
            effect={`A new link goes to ${invite.email}, valid for 7 days. The link they had stops working.`}
            submitLabel="Send again"
            quickReasons={["They didn't get it", "Their link ran out"]}
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await resendInviteAction(invite.id, {
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                onDone?.(
                    result.data.emailed
                        ? `Invite sent again to ${invite.email}. It works until ${formatDate(result.data.expiresAt)}.`
                        : `A new link is ready, but the email to ${invite.email} didn't go. Try again in a minute.`,
                );
                return { ok: true };
            }}
        />
    );
}

/** Take an invite back before it is accepted (U24). */
export function WithdrawInvite({
    invite,
    onDone,
}: {
    invite: StaffInvite;
    onDone?: (message: string) => void;
}) {
    return (
        <OperatorDialog
            trigger="Withdraw…"
            triggerVariant="ghost"
            title={`Take back ${invite.name}'s invite?`}
            effect="Their link stops working and they won't join the team. You can invite them again later."
            submitLabel="Take back the invite"
            destructive
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await withdrawInviteAction(invite.id, {
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                onDone?.(`${invite.name}'s invite was taken back.`);
                return { ok: true };
            }}
        />
    );
}
