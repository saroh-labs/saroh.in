import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { FailedPanel } from "@/components/states/failed-panel";
import { LeadsBoard } from "@/components/team/leads-board";
import { can, requireStaff } from "@/lib/console";
import { param } from "@/lib/params";
import { readOwnerFilter } from "@/lib/saroh-lead-words";
import { getLeadsBoard } from "@/lib/saroh-leads";

export const metadata = { title: "Leads" };

/**
 * Saroh's own sales leads (DEC-169, admin console U20): questions from
 * saroh.in, the waitlist, and the leads the team adds, as a board by stage.
 * An Account manager sees their own; Support and Platform owner see every
 * lead and give out the ones nobody has. Not a business's Leads: those are
 * the merchant's own, in their app.
 */
export default async function LeadsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("saroh-leads:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const owner = readOwnerFilter(param(raw.owner));
    const q = param(raw.q) ?? "";
    const board = await getLeadsBoard({ owner, q }).catch(() => undefined);

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Team", "Leads"]}
                    title="Leads"
                    description={
                        board?.scope === "own"
                            ? "The leads you work, by stage. A lead that starts paying becomes one of your businesses."
                            : "Saroh's own sales leads, by stage: questions from saroh.in, the waitlist, and the ones the team adds."
                    }
                />
                {board ? (
                    <LeadsBoard
                        board={board}
                        owner={owner}
                        q={q}
                        canWrite={can(staff, "saroh-leads:write")}
                    />
                ) : (
                    <FailedPanel things="leads" />
                )}
            </PageContainer>
        </AdminShell>
    );
}
