import { MemberBusinesses } from "@/components/team/member-businesses";
import { can, requireStaff } from "@/lib/console";
import { getTeamMember } from "@/lib/team-member";
import { memberAccessOf } from "@/lib/team-member-words";

export const metadata = { title: "Teammate · Businesses" };

/** Businesses (R33): the ones they look after, and how each came in. */
export default async function TeamMemberBusinesses({
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
        <MemberBusinesses
            platformAdminId={member.platformAdminId}
            businesses={member.businesses}
            self={member.self}
            canLog={memberAccessOf(member, staff.permissions).logCall}
            canOpen={can(staff, "organization:read")}
            canSetRate={can(staff, "commission:rates")}
        />
    );
}
