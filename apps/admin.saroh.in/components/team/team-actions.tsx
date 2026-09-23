"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";

import type { AdminRole } from "@/lib/control-plane";
import { ROLE_LABEL, ROLE_PURPOSE } from "@/lib/roles";
import type { StaffMember } from "@/lib/staff";
import {
    amendStaffAction,
    grantStaffAction,
    revokeStaffAction,
} from "@/lib/team-actions";

import { OperatorDialog } from "../operator-dialog";

const ROLES = Object.keys(ROLE_LABEL) as AdminRole[];

function RolePicker({ selected = [] }: { selected?: AdminRole[] }) {
    return (
        <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Roles</legend>
            {ROLES.map((role) => (
                <label
                    key={role}
                    className="flex items-start gap-2.5 text-sm coarse:min-h-11"
                >
                    <input
                        type="checkbox"
                        name="roles"
                        value={role}
                        defaultChecked={selected.includes(role)}
                        className="mt-0.5 size-4 accent-foreground"
                    />
                    <span>
                        <span className="font-medium">{ROLE_LABEL[role]}</span>
                        <span className="block text-[13px] text-muted-foreground">
                            {ROLE_PURPOSE[role]}
                        </span>
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

function ExpiryField({ defaultValue }: { defaultValue?: string }) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor="staff-expiry">Access ends (optional)</Label>
            <Input
                id="staff-expiry"
                name="expiresOn"
                type="date"
                defaultValue={defaultValue}
            />
            <p className="text-[13px] text-muted-foreground">
                Leave empty for access that lasts until someone revokes it.
            </p>
        </div>
    );
}

/** A date input's day, as the end of that day in the operator's own time. */
function endOfDay(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const date = new Date(`${value}T23:59:59`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function rolesFrom(form: FormData): string[] {
    return form
        .getAll("roles")
        .filter((value): value is string => typeof value === "string");
}

export function GrantStaff() {
    return (
        <OperatorDialog
            trigger="Grant access"
            triggerVariant="default"
            title="Grant staff access"
            effect="They need a Saroh account already. Their access works from their next request, and the grant is in the trail with your reason."
            fields={
                <>
                    <div className="grid gap-1.5">
                        <Label htmlFor="staff-email">Their email</Label>
                        <Input
                            id="staff-email"
                            name="email"
                            type="email"
                            required
                            autoComplete="off"
                        />
                    </div>
                    <RolePicker />
                    <ExpiryField />
                </>
            }
            submitLabel="Grant access"
            onSubmit={({ reason, idempotencyKey, values, form }) =>
                grantStaffAction({
                    email: values.email ?? "",
                    roles: rolesFrom(form),
                    reason,
                    expiresAt: endOfDay(values.expiresOn),
                    idempotencyKey,
                })
            }
        />
    );
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
