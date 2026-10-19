import { StatCard } from "@saroh/ui/stat-card";

import { plural } from "@/lib/format";
import type { StaffInvite, StaffMember } from "@/lib/staff";

import { PayoutsSlot } from "./payouts-slot";

/**
 * The Teammates tab's counts (R30): people on the team, account managers,
 * and businesses without a manager (only for staff who may see every
 * business's manager, `accounts:read`). The commission card is the
 * payouts slot, only for `team:pay`.
 */
export function SummaryCards({
    members,
    invites,
    unassigned,
    canPay,
}: {
    members: StaffMember[];
    invites: StaffInvite[];
    /** Null: not shown (no `accounts:read`, or the read failed). */
    unassigned: number | null;
    canPay: boolean;
}) {
    const active = members.filter((member) => !member.revokedAt);
    const waiting = invites.filter(
        (invite) => invite.state === "waiting",
    ).length;
    const managers = active.filter((member) =>
        member.roles.some((role) => role.role === "ACCOUNT_MANAGER"),
    );
    const onCommission = managers.filter(
        (member) => member.profile?.onCommission,
    ).length;

    return (
        <div
            aria-label="Team in numbers"
            role="group"
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
            <StatCard
                label="People"
                value={active.length}
                hint={
                    waiting > 0
                        ? `${plural(waiting, "invite")} waiting`
                        : "With access to this console"
                }
            />
            <StatCard
                label="Account manager role"
                value={managers.length}
                hint={`${onCommission} on commission`}
            />
            {unassigned !== null && (
                <StatCard
                    label="Businesses without a manager"
                    value={unassigned}
                    hint={
                        unassigned === 0 ? (
                            "Every business has one"
                        ) : (
                            <a href="#unassigned" className="underline">
                                See the list
                            </a>
                        )
                    }
                />
            )}
            {canPay && <PayoutsSlot place="summary" />}
        </div>
    );
}
