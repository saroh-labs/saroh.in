import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { ClaimPlatformOwnerDialog } from "@/components/claim-platform-owner-dialog";
import { EmptyPanel } from "@/components/states/empty-panel";
import { requireStaff } from "@/lib/console";

export const metadata = { title: "Your page" };

/**
 * Your page on the Team (admin console U22): your own teammate page, which
 * every staff member with a recorded grant may open (an Account manager
 * too, who can't open the Team list). Break-glass access has no team
 * record, so there is no page to go to: the panel offers the banner's own
 * Make me Platform owner, which records one.
 */
export default async function YourPage() {
    const gate = await requireStaff();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    if (staff.platformAdminId) {
        redirect(`/team/${encodeURIComponent(staff.platformAdminId)}`);
    }
    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Keep it running", "Team", "Your page"]}
                    title="Your page"
                />
                <EmptyPanel
                    title="No page yet"
                    description="You're in through the emergency list, so you aren't on the Team yet. Your businesses, leads and earnings show here once you are."
                    action={
                        <ClaimPlatformOwnerDialog triggerVariant="default" />
                    }
                />
            </PageContainer>
        </AdminShell>
    );
}
