import { PageContainer } from "@saroh/ui/page-container";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { EmptyPanel } from "@/components/states/empty-panel";
import { requireStaff } from "@/lib/console";

export const metadata = { title: "Your page" };

/**
 * Your page on the Team (admin console U22): your own teammate page, which
 * every staff member with a recorded grant may open (an Account manager
 * too, who can't open the Team list). Break-glass access has no team
 * record, so there is no page to go to.
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
            <PageContainer>
                <EmptyPanel
                    title="No page yet"
                    description="Your access comes from the emergency staff list, not a recorded grant, so you have no page on the Team. Make yourself Platform owner from the banner to get one."
                />
            </PageContainer>
        </AdminShell>
    );
}
