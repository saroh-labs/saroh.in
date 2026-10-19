import { MemberProfile } from "@/components/team/member-profile";
import { can, requireStaff } from "@/lib/console";
import { listTeam } from "@/lib/staff";
import { getTeamMember } from "@/lib/team-member";
import { memberAccessOf } from "@/lib/team-member-words";

export const metadata = { title: "Teammate · Profile" };

/** Profile (R33): their details, what's missing, and their console access. */
export default async function TeamMemberProfile({
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
    const access = memberAccessOf(member, staff.permissions);
    // Who they may report to, only for someone who can edit it.
    const team =
        access.editProfile && can(staff, "team:read")
            ? await listTeam().catch(() => null)
            : null;

    return (
        <MemberProfile
            member={member}
            pay={access.pay}
            canEdit={access.editProfile}
            teammates={(team ?? [])
                .filter((teammate) => !teammate.revokedAt)
                .map((teammate) => ({
                    platformAdminId: teammate.platformAdminId,
                    name: teammate.name ?? teammate.email,
                }))}
        />
    );
}
