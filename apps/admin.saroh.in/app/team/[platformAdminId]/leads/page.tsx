import { NoAccessPanel } from "@/components/not-authorized";
import { MemberLeads } from "@/components/team/member-leads";
import { requireStaff } from "@/lib/console";
import { getTeamMember } from "@/lib/team-member";
import { memberAccessOf } from "@/lib/team-member-words";

export const metadata = { title: "Teammate · Leads" };

/**
 * Leads (R33): the leads they work. Only for the teammate themself and
 * for Support and Platform owner; the API sends none to anyone else.
 */
export default async function TeamMemberLeads({
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
    if (member.leads === null) return <NoAccessPanel email={staff.email} />;

    return (
        <MemberLeads
            leads={member.leads}
            self={member.self}
            canLog={memberAccessOf(member, staff.permissions).logCall}
        />
    );
}
