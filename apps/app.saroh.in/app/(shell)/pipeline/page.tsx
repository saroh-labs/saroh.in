import { readBusinessCurrency } from "@/lib/organizations/business-currency";
import { forbidden } from "next/navigation";

import { PipelineContainer } from "@/components/crm/pipeline-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { canOrUnknown } from "@/lib/access/require-can";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Pipeline board for the active organization (S3-005) — the acceptance
 * deliverable "owner views and moves lead stages". One column per Stage (in
 * board order); each Lead card sits under its current stage and carries a
 * move-stage control (a Select of the pipeline's stages). Deliberately no
 * drag-and-drop — a Select is simple, robust, and accessible.
 *
 * The board shows the org's DEFAULT pipeline (or the first one) when several
 * exist; a full pipeline switcher is a later refinement.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (the layout's
 * CRM `ModuleGate`, `lead:read`, what this role may do) and the currency
 * are the page's; the board (`/api/pipeline`) is `PipelineContainer`'s
 * query.
 */
export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
    await requireSession();

    const [organization, currency] = await Promise.all([
        resolveActiveOrganization(),
        // A lead's Worth is in the business's currency (owner, 11 Oct).
        readBusinessCurrency(),
    ]);
    // A role without leads is refused, not an empty board (UX-027).
    if (!canOrUnknown(organization, "lead:read")) forbidden();

    return (
        <PageContainer width="full">
            <PipelineContainer
                // `lead:write` adds a lead and moves its stage
                // (`leads.service.ts`). Without it the board reads, with no
                // control that would be refused.
                canWrite={canOrUnknown(organization, "lead:write")}
                // From what the API resolved this person may do; the role's
                // name only as the fallback for a response that predates
                // permissions.
                mayManage={
                    organization?.actions
                        ? organization.actions.includes("pipeline:manage")
                        : organization?.role === "OWNER" ||
                          organization?.role === "ADMIN"
                }
                currency={currency}
            />
        </PageContainer>
    );
}
