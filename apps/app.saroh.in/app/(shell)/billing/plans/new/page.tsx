import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";
import { PlanEditor } from "@/components/subscriptions/plan-editor/plan-editor";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";
import { planEditorContext } from "@/lib/subscriptions/plan-editor-data";

export const metadata = { title: "New plan" };

/**
 * Payments → Plans → New plan (plan 2026-09-26-004, D7), after "Saroh Plan
 * Editor". Nothing is saved until it has a name; then it is a Draft nobody
 * can join, and the address becomes its edit page. Publish opens it.
 */
export default async function NewPlanPage() {
    await requireSession();
    const organization = await resolveActiveOrganization();
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    if (organization?.actions && !may("subscription:write")) {
        return (
            <AccessDenied
                title="You can't make plans"
                description={`Your role in ${organization.name} can't make or change plans. An owner or admin can change that in Team.`}
                backHref={may("subscription:read") ? PLANS_HREF : "/"}
                backLabel={
                    may("subscription:read") ? "Back to plans" : "Back to Home"
                }
            />
        );
    }

    const context = await planEditorContext(null);

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <PlanEditor
                initial={null}
                figures={null}
                takenNames={context.takenNames}
                withClasses={context.withClasses}
                autopayOffered={context.autopayOffered}
                currency={context.currency}
                canEdit
            />
        </PageContainer>
    );
}
