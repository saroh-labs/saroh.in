import { FailedPanel } from "@/components/states/failed-panel";
import { TeamPeople } from "@/components/team/people-table";
import { SummaryCards } from "@/components/team/summary-cards";
import { UnassignedBusinesses } from "@/components/team/unassigned-businesses";
import { readPayouts } from "@/lib/commission";
import { can, requireStaff } from "@/lib/console";
import type { StaffInvite, UnassignedList } from "@/lib/staff";
import { listInvites, listTeam, listUnassigned } from "@/lib/staff";

export const metadata = { title: "Team" };

/**
 * Teammates (R30): the counts, the people with their job, roles, access
 * and businesses against capacity (and invites waiting, for `staff:read`),
 * then the businesses without a manager (for `accounts:read`). Granting,
 * changing and revoking access happen here, never in SQL.
 */
export default async function TeammatesPage() {
    const gate = await requireStaff("team:read");
    if (!gate.ok) return null;
    const { staff } = gate;
    const seesInvites = can(staff, "staff:read");
    const seesManagers = can(staff, "accounts:read");

    const canPay = can(staff, "team:pay");
    const [members, invites, unassigned, payouts] = await Promise.all([
        listTeam().catch(() => undefined),
        seesInvites
            ? listInvites().catch(() => null)
            : Promise.resolve<StaffInvite[] | null>(null),
        seesManagers
            ? listUnassigned().catch(() => null)
            : Promise.resolve<UnassignedList | null>(null),
        canPay ? readPayouts().catch(() => null) : Promise.resolve(null),
    ]);

    if (!members) return <FailedPanel things="the team" />;

    return (
        <div className="grid gap-6">
            <SummaryCards
                members={members}
                invites={invites ?? []}
                unassigned={unassigned ? unassigned.total : null}
                canPay={canPay}
                commission={payouts?.totals ?? null}
            />
            <TeamPeople
                members={members}
                invites={invites ?? []}
                canGrant={can(staff, "staff:grant")}
            />
            {seesManagers &&
                (unassigned ? (
                    <UnassignedBusinesses
                        businesses={unassigned.businesses}
                        total={unassigned.total}
                        canAssign={can(staff, "accounts:assign")}
                    />
                ) : (
                    <FailedPanel things="businesses without a manager" />
                ))}
        </div>
    );
}
