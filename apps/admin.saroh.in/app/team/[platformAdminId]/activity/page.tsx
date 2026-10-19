import { MemberActivity } from "@/components/team/member-activity";
import { requireStaff } from "@/lib/console";
import { getTeamMember } from "@/lib/team-member";
import { memberAccessOf } from "@/lib/team-member-words";

export const metadata = { title: "Teammate · Activity" };

/** Activity (R33): their calls and visits, roles and businesses, newest first. */
export default async function TeamMemberActivity({
    params,
}: {
    params: Promise<{ platformAdminId: string }>;
}) {
    const gate = await requireStaff();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { platformAdminId } = await params;
    const member = await getTeamMember(platformAdminId).catch(() => null);
    if (!member) return null;

    return (
        <MemberActivity
            platformAdminId={member.platformAdminId}
            activity={member.activity}
            businesses={member.businesses}
            leads={member.leads}
            canLog={memberAccessOf(member, staff.permissions).logCall}
        />
    );
}
