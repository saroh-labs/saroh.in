import { NoAccessPanel } from "@/components/not-authorized";
import { FailedPanel } from "@/components/states/failed-panel";
import { EarningsCard } from "@/components/team/earnings";
import { can, requireStaff } from "@/lib/console";
import { getMemberEarnings, getTeamMember } from "@/lib/team-member";

export const metadata = { title: "Teammate · Earnings" };

/**
 * Earnings (R33, U21's `EarningsCard`): only with `team:pay` (Platform
 * owner and Billing). Anyone else who types the address gets the
 * no-access panel; the API refuses the read regardless.
 */
export default async function TeamMemberEarnings({
    params,
}: {
    params: Promise<{ platformAdminId: string }>;
}) {
    const gate = await requireStaff();
    if (!gate.ok) return null;
    const { staff } = gate;
    if (!can(staff, "team:pay")) return <NoAccessPanel email={staff.email} />;
    const { platformAdminId } = await params;
    const member = await getTeamMember(platformAdminId).catch(() => null);
    if (!member) return null;
    const earnings = await getMemberEarnings(member.platformAdminId).catch(
        () => undefined,
    );
    if (earnings === undefined) return <FailedPanel things="their earnings" />;
    if (earnings === null) return <NoAccessPanel email={staff.email} />;

    return <EarningsCard earnings={earnings} />;
}
