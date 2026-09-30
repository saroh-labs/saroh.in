import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/shared/access-denied";
import { PlanEditor } from "@/components/subscriptions/plan-editor/plan-editor";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { readPlanEditor } from "@/lib/subscriptions/plan-drafts";
import { planEditorContext } from "@/lib/subscriptions/plan-editor-data";

export const metadata = { title: "Edit plan" };

/**
 * Payments → Plans → one plan → Edit (plan 2026-09-26-004, D7), after
 * "Saroh Plan Editor". A live plan's edits are kept on the server as
 * unpublished changes until "Publish changes"; a draft's are the plan.
 *
 * An unknown id is the parent's not-found ("That plan isn't here"). A role
 * that can read plans but not change them sees the plan, read-only.
 */
export default async function EditPlanPage({
    params,
}: {
    params: Promise<{ planId: string }>;
}) {
    await requireSession();
    const [{ planId }, organization] = await Promise.all([
        params,
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    if (organization?.actions && !may("subscription:read")) {
        return (
            <AccessDenied
                title="You can't open this plan"
                description={`Your role in ${organization.name} can't see plans — their prices and money stay with the roles that can. An owner or admin can change that in Team.`}
            />
        );
    }

    const [record, context] = await Promise.all([
        readPlanEditor(planId),
        planEditorContext(planId),
    ]);
    if (!record) notFound();

    const archived = record.status === "ARCHIVED";
    const canWrite = may("subscription:write");

    // The editor shell draws the page's one <main>.
    return (
        <PlanEditor
            initial={record}
            figures={context.plan}
            takenNames={context.takenNames}
            withClasses={context.withClasses}
            autopayOffered={context.autopayOffered}
            currency={record.values.currency}
            canEdit={canWrite && !archived}
            readOnlyText={
                !canWrite
                    ? "Your role can see this plan but not change it."
                    : "This plan is archived. Sell it again from Plans before changing it."
            }
        />
    );
}
