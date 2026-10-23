import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { AddTeammate } from "@/components/team/add-teammate-sheet";
import { TeamTabs } from "@/components/team/team-tabs";
import { can, requireStaff } from "@/lib/console";

/**
 * The Team screen (DEC-169, admin console U17, R30): who can use this
 * console, what each role may do, and who looks after which business.
 * The header and the tabs (Teammates · Console roles · Payouts) over each
 * tab's own address. `team:read` opens it; staff without it get the
 * no-access panel inside the shell. Add a teammate needs `staff:grant`.
 */
export default async function TeamLayout({
    children,
}: {
    children: ReactNode;
}) {
    const gate = await requireStaff("team:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="wide">
                <PageHeader
                    breadcrumb={["Keep it running", "Team"]}
                    title="Team"
                    description="Who can use this console, what each of them may do, and who looks after which business."
                    actions={
                        can(staff, "staff:grant") ? <AddTeammate /> : undefined
                    }
                />
                <TeamTabs permissions={staff.permissions} />
                {children}
            </PageContainer>
        </AdminShell>
    );
}
