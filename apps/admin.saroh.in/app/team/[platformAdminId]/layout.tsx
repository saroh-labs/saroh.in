import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { FailedPanel } from "@/components/states/failed-panel";
import { MemberBody } from "@/components/team/member-body";
import { can, requireStaff } from "@/lib/console";
import {
    getMemberEarnings,
    getTeamMember,
    marketingSiteUrl,
} from "@/lib/team-member";
import type { TeamMember } from "@/lib/team-member-words";
import { memberAccessOf, memberName } from "@/lib/team-member-words";

// "Teammate", never their name: a tab's title shows in a screen share.
export const metadata = { title: "Teammate" };

/**
 * A teammate's page (DEC-169, admin console U22, R33): the header, the
 * counts, their manager link and code, and the tabs Profile · Businesses
 * · Leads · Earnings · Activity, each an address. Any staff member may
 * ask; the API answers `team:read` for anyone's page and everyone else
 * for their own, and refuses the rest (the no-access panel). Read once per
 * request (`getTeamMember` is cached) here and in the tab below.
 */
export default async function TeamMemberLayout({
    params,
    children,
}: {
    params: Promise<{ platformAdminId: string }>;
    children: ReactNode;
}) {
    const gate = await requireStaff();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { platformAdminId } = await params;

    let member: TeamMember | null;
    try {
        member = await getTeamMember(platformAdminId);
    } catch (error) {
        if (error instanceof Error && error.message.endsWith("failed: 404")) {
            notFound();
        }
        return (
            <AdminShell staff={staff}>
                <PageContainer width="wide">
                    <FailedPanel things="this teammate" />
                </PageContainer>
            </AdminShell>
        );
    }
    const access = member
        ? memberAccessOf(member, staff.permissions)
        : { editProfile: false, pay: false, logCall: false };
    const [earnings, siteUrl] = await Promise.all([
        member && access.pay
            ? getMemberEarnings(member.platformAdminId).catch(() => null)
            : Promise.resolve(undefined),
        marketingSiteUrl(),
    ]);
    const name = member ? memberName(member) : null;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                {member && name ? (
                    <PageHeader
                        breadcrumb={["Keep it running", "Team", name]}
                        title={member.self ? `${name} (you)` : name}
                        description={
                            name === member.email ? undefined : member.email
                        }
                    />
                ) : null}
                <MemberBody
                    member={member}
                    email={staff.email}
                    access={access}
                    earnings={earnings}
                    siteUrl={siteUrl}
                    backToTeam={can(staff, "team:read")}
                >
                    {children}
                </MemberBody>
            </PageContainer>
        </AdminShell>
    );
}
